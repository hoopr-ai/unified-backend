// ─── PLG growth analytics — the shared query core ────────────────────────────
//
// Every PLG endpoint is the same four CTEs with a different final SELECT:
//
//   plg_v2u  browser → the account it first signed into
//   acts     every catalogue action the request needs, as (pk, uid, at, a, d)
//   pp       one row per person: first appearance, first touch, surface, plan …
//   reach    when each person reached each lifecycle stage
//
// Two modes, and the difference matters more than anything else here:
//
//   cohort    People whose FIRST-EVER appearance is in the window, followed for
//             `horizonDays`. Rungs are NESTED — a person counts only if they
//             reached every rung above too (in any order). This is the funnel
//             that answers "what share of new people end up paying".
//
//   activity  Everyone who did anything in the window, and what they did IN
//             it. NOT nested: a subscriber who downloads today did not sign up
//             today, and forcing nesting would hide them. The ratios between
//             rungs are ratios, not conversion rates, and the payload says so.

import {
  ACTION_BY_KEY,
  APP_UA,
  CHANNEL_SQL,
  LANDING_SQL,
  REAL_SESSION,
  SEGMENT_BY_KEY,
  STAGES,
  type StageSpec,
} from "./plg-catalogue";

export type PlgMode = "cohort" | "activity";
export type PlgSurface = "all" | "web" | "app";
export type Granularity = "day" | "week" | "month";

export interface PlgFilters {
  /** Inclusive IST calendar day, YYYY-MM-DD. */
  startDate: string;
  /** Inclusive IST calendar day, YYYY-MM-DD. */
  endDate: string;
  mode: PlgMode;
  /** Cohort mode: how long after first appearance a conversion still counts. */
  horizonDays: number;
  surface: PlgSurface;
  /** A segment to filter by, with its value. */
  segment?: string | null;
  segmentValue?: string | null;
  [key: string]: unknown;
}

// ── The window ──────────────────────────────────────────────────────────────

const DAY_MS = 86_400_000;
/** India has no DST, so the offset is a constant. */
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** IST midnight of a YYYY-MM-DD, as an absolute instant. */
export const istMidnight = (day: string): Date =>
  new Date(Date.parse(`${day}T00:00:00Z`) - IST_OFFSET_MS);

export const addDays = (day: string, n: number): string =>
  new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);

export const daysInclusive = (f: { startDate: string; endDate: string }): number =>
  Math.floor((Date.parse(`${f.endDate}T00:00:00Z`) - Date.parse(`${f.startDate}T00:00:00Z`)) / DAY_MS) + 1;

/** The same-length window immediately before. */
export const previousWindow = <T extends PlgFilters>(f: T): T => {
  const n = daysInclusive(f);
  return { ...f, startDate: addDays(f.startDate, -n), endDate: addDays(f.startDate, -1) };
};

/**
 * Bind values for the core. `actTo` is where rows stop being read: the window
 * end in activity mode, and window end + horizon (never past now) in cohort
 * mode, so a cohort's later conversions are seen.
 */
export const coreBinds = (f: PlgFilters, now = new Date()): Record<string, unknown> => {
  const winStart = istMidnight(f.startDate);
  const winEnd = istMidnight(addDays(f.endDate, 1));
  const horizonEnd = new Date(winEnd.getTime() + f.horizonDays * DAY_MS);
  const actTo =
    f.mode === "cohort" ? new Date(Math.min(horizonEnd.getTime(), now.getTime())) : winEnd;
  return {
    winStart: winStart.toISOString(),
    winEnd: winEnd.toISOString(),
    actFrom: winStart.toISOString(),
    actTo: actTo.toISOString(),
    horizonDays: f.horizonDays,
    segmentValue: f.segmentValue ?? null,
  };
};

/**
 * Has every person in the window had the full horizon to convert? A cohort
 * that started yesterday has had one day, and its conversion rate is not yet
 * comparable with last month's.
 */
export const cohortMaturity = (f: PlgFilters, now = new Date()) => {
  const winEnd = istMidnight(addDays(f.endDate, 1));
  const matureAt = new Date(winEnd.getTime() + f.horizonDays * DAY_MS);
  return {
    mature: f.mode !== "cohort" || matureAt.getTime() <= now.getTime(),
    matureAt: matureAt.toISOString(),
  };
};

// ── Identity ────────────────────────────────────────────────────────────────

/**
 * Browser → the first account it signed into. The partial index
 * native_sessions_visitor_user_idx serves this directly.
 */
export const V2U_CTE = `
  plg_v2u AS MATERIALIZED (
    SELECT DISTINCT ON (s."visitorId") s."visitorId" AS vid, s."userId" AS uid
      FROM native_sessions s
     WHERE s."userId" IS NOT NULL
     ORDER BY s."visitorId", s."startedAt"
  )`;

// ── Actions ─────────────────────────────────────────────────────────────────

export const q_ = (s: string): string => `'${s.replace(/'/g, "''")}'`;
export const inList = (xs: readonly string[]): string => xs.map(q_).join(", ");

/** The actions a stage list reads, plus any extras, de-duplicated. */
export const actionsFor = (stages: readonly StageSpec[], extra: readonly string[] = []): string[] =>
  [...new Set([...stages.flatMap((s) => s.actions), ...extra])];

export const actsCte = (keys: readonly string[]): string => {
  const parts = keys.map((k) => {
    const spec = ACTION_BY_KEY[k];
    if (!spec) throw new Error(`Unknown PLG action: ${k}`);
    return `SELECT x.pk, x.uid::bigint AS uid, x.at, ${q_(k)}::text AS a, x.d::text AS d
      FROM (${spec.sql}
      ) x`;
  });
  return `
  acts AS MATERIALIZED (
    ${parts.join("\n    UNION ALL\n    ")}
  )`;
};

// ── Stages ──────────────────────────────────────────────────────────────────

export const STAGE = (key: string): StageSpec => {
  const s = STAGES.find((x) => x.key === key);
  if (!s) throw new Error(`Unknown PLG stage: ${key}`);
  return s;
};

/** The actions that mean a person was on the platform at all. */
export const PRESENCE = actionsFor(
  STAGES.filter((s) => s.key !== "post_sub"),
  ["download", "whitelist", "video_claim", "mix"],
);

/** Person-level expressions a segment may reference, by name. */
const SEGMENT_FILTER = (f: PlgFilters): string => {
  if (!f.segment) return "TRUE";
  const seg = SEGMENT_BY_KEY[f.segment];
  if (!seg) throw new Error(`Unknown PLG segment: ${f.segment}`);
  return `${seg.sql} = :segmentValue`;
};

const SURFACE_FILTER = (f: PlgFilters): string =>
  f.surface === "web" ? "pp.has_web" : f.surface === "app" ? "pp.has_app" : "TRUE";

/**
 * The whole core, up to and including `reach`. Callers append a SELECT.
 *
 * `extraActions` pulls more actions into `acts` for panels that need them
 * (browse, page views, retention …); the stages' own actions are always there.
 */
export const buildCore = (f: PlgFilters, extraActions: readonly string[] = []): string => {
  const keys = actionsFor(STAGES, extraActions);
  const s = (k: string) => inList(STAGE(k).actions);
  const cohort = f.mode === "cohort";

  // A rung's time: its first action inside the person's clock. In cohort mode
  // that clock starts at first appearance and runs for the horizon; in activity
  // mode it is the window.
  const within = cohort
    ? `x.at >= pp.first_seen AND x.at < pp.first_seen + make_interval(days => :horizonDays)`
    : `x.at >= :winStart AND x.at < :winEnd`;

  return `
WITH ${V2U_CTE},
${actsCte(keys)},
  cand AS (
    SELECT pk,
           max(uid) AS uid,
           bool_or(a = 'visit_web') AS has_web,
           bool_or(a IN ('app_open', 'project')) AS has_app,
           bool_or((a = 'visit_web' AND d = 'signed_in') OR a IN ('app_open', 'project', 'account_created')) AS signed_in
      FROM acts
     WHERE at >= :winStart AND at < :winEnd
       AND a IN (${inList(cohort ? ["visit_web", "app_open", "account_created"] : PRESENCE.filter((k) => keys.includes(k)))})
     GROUP BY pk
  ),
  cand_vids AS (
    SELECT c.pk, substr(c.pk, 2) AS vid FROM cand c WHERE c.uid IS NULL
    UNION
    SELECT c.pk, m.vid FROM cand c JOIN plg_v2u m ON m.uid = c.uid
  ),
  -- Each browser's first REAL session, by index (visitorId, startedAt), then
  -- the earliest across a person's browsers. Sorting every session of every
  -- browser instead cost seconds per query.
  fv AS (
    SELECT cv.pk, f.*
      FROM cand_vids cv
      CROSS JOIN LATERAL (
             SELECT s."startedAt", s."userId", s."landingPath", s."referrerDomain",
                    s."utmSource", s."utmMedium", s."utmCampaign", s.gclid, s.fbclid, s."refCode",
                    s."shareToken", s."deviceType"
               FROM native_sessions s
              WHERE s."visitorId" = cv.vid AND ${REAL_SESSION("s")}
              ORDER BY s."startedAt"
              LIMIT 1
           ) f
  ),
  fw AS MATERIALIZED (
    SELECT DISTINCT ON (fv.pk) fv.* FROM fv ORDER BY fv.pk, fv."startedAt"
  ),
  pp0 AS (
    SELECT c.pk, c.uid, c.has_web, c.has_app, c.signed_in,
           LEAST(fw."startedAt", acc.signed_up_at, ap.first_app) AS first_seen,
           acc.signed_up_at,
           acc.state,
           paid.plan_code AS paid_plan,
           paid.since AS paid_since,
           lastsub.plan_code AS last_plan,
           ${CHANNEL_SQL("fw")} AS channel,
           ${LANDING_SQL("fw")} AS landing,
           fw."deviceType" AS device_type,
           fw."utmSource" AS utm_src,
           fw."utmCampaign" AS utm_cmp,
           COALESCE(fw."referrerDomain", CASE WHEN fw."startedAt" IS NULL THEN NULL ELSE '(none)' END) AS referrer_domain,
           split_part(fw."landingPath", '?', 1) AS landing_path
      FROM cand c
      LEFT JOIN fw ON fw.pk = c.pk
      LEFT JOIN LATERAL (
             SELECT COALESCE(x."createdAt", x."onboardedAt") AS signed_up_at, x.state
               FROM users x WHERE x.id = c.uid
           ) acc ON TRUE
      LEFT JOIN LATERAL (
             SELECT min(us."createdAt") AS first_app
               FROM user_sessions us WHERE us."userId" = c.uid AND us.${APP_UA}
           ) ap ON TRUE
      -- Paid access overlapping the window: an activated subscription that had
      -- started by the window's end and had not lapsed before its start.
      LEFT JOIN LATERAL (
             SELECT us."planCode" AS plan_code, min(us."createdAt") OVER () AS since
               FROM user_subscriptions us
              WHERE us."userId" = c.uid AND us."currentPeriodStart" IS NOT NULL
                AND us."createdAt" < :winEnd
                AND COALESCE(us."currentPeriodEnd", 'infinity'::timestamptz) >= :winStart
              ORDER BY us."createdAt" DESC LIMIT 1
           ) paid ON TRUE
      LEFT JOIN LATERAL (
             SELECT us."planCode" AS plan_code
               FROM user_subscriptions us
              WHERE us."userId" = c.uid AND us."currentPeriodStart" IS NOT NULL AND us."createdAt" < :actTo
              ORDER BY us."createdAt" DESC LIMIT 1
           ) lastsub ON TRUE
  ),
  -- Per-person lookups done ONCE as grouped sets. A LATERAL over \`acts\` would
  -- rescan the whole materialised set for every person.
  fa AS (
    SELECT DISTINCT ON (x.pk) x.pk, x.a AS first_action
      FROM acts x
     WHERE x.a IN (${s("activation")})
     ORDER BY x.pk, x.at
  ),
  sm AS (
    SELECT DISTINCT ON (e."userId") e."userId" AS uid, e.properties->>'signup_method' AS signup_method
      FROM native_events e
     WHERE e."eventName" = 'SIGNUP_COMPLETED' AND e.source = 'CLIENT' AND e."userId" IS NOT NULL
     ORDER BY e."userId", e."occurredAt"
  ),
  pp AS MATERIALIZED (
    SELECT pp0.*,
           CASE WHEN pp0.paid_plan IS NOT NULL THEN 'Subscribed'
                WHEN pp0.signed_in THEN 'Signed up'
                ELSE 'Signed out' END AS auth_state,
           CASE WHEN pp0.first_seen >= :winStart THEN 'New' ELSE 'Returning' END AS visitor_type,
           COALESCE(pp0.last_plan, 'No plan') AS plan,
           COALESCE(lower(pp0.device_type), CASE WHEN pp0.has_app THEN 'app' ELSE '(unknown)' END) AS device,
           CASE WHEN pp0.has_web AND pp0.has_app THEN 'Web + app'
                WHEN pp0.has_app THEN 'App' ELSE 'Web' END AS surface,
           COALESCE(pp0.utm_src, '(none)') AS utm_source,
           COALESCE(pp0.utm_cmp, '(none)') AS utm_campaign,
           COALESCE(NULLIF(initcap(btrim(pp0.state)), ''), '(not given)') AS profile_state,
           COALESCE(fa.first_action, 'none') AS first_action,
           COALESCE(sm.signup_method, CASE WHEN pp0.uid IS NULL THEN 'No account' ELSE '(not recorded)' END) AS signup_method
      FROM pp0
      LEFT JOIN fa ON fa.pk = pp0.pk
      LEFT JOIN sm ON sm.uid = pp0.uid
  ),
  pop AS (
    SELECT pp.* FROM pp
     WHERE ${cohort ? "pp.first_seen >= :winStart AND pp.first_seen < :winEnd" : "TRUE"}
       AND ${SURFACE_FILTER(f)}
       AND ${SEGMENT_FILTER(f)}
  ),
  reach0 AS MATERIALIZED (
    SELECT pp.pk,
           ${cohort ? "pp.first_seen" : `min(x.at) FILTER (WHERE x.a IN (${inList(PRESENCE.filter((k) => keys.includes(k)))}) AND ${within})`} AS t_traffic,
           min(x.at) FILTER (WHERE x.a IN (${s("activation")}) AND ${within}) AS t_activation,
           min(x.at) FILTER (WHERE x.a IN (${s("signup")}) AND ${within}) AS t_signup,
           min(x.at) FILTER (WHERE x.a IN (${s("intent")}) AND ${within}) AS t_intent,
           min(x.at) FILTER (WHERE x.a IN (${s("subscription")}) AND ${within}) AS t_subscription
      FROM pop pp
      LEFT JOIN acts x ON x.pk = pp.pk
     GROUP BY pp.pk, pp.first_seen
  ),
  -- MATERIALIZED: left inline, the planner re-aggregates this once per person
  -- (measured: 9.3s of a 17.5s cohort query).
  post AS MATERIALIZED (
    SELECT r.pk, min(x.at) AS t_post
      FROM reach0 r
      JOIN pop pp ON pp.pk = r.pk
      JOIN acts x ON x.pk = r.pk
     WHERE x.a IN (${s("post_sub")})
       AND ${
         cohort
           ? `r.t_subscription IS NOT NULL AND x.at > r.t_subscription
              AND x.at < r.t_subscription + make_interval(days => :horizonDays)`
           : `x.at >= :winStart AND x.at < :winEnd
              AND COALESCE(r.t_subscription, pp.paid_since) IS NOT NULL
              AND x.at >= COALESCE(r.t_subscription, pp.paid_since)`
       }
     GROUP BY r.pk
  ),
  reach AS MATERIALIZED (
    SELECT r.*, post.t_post FROM reach0 r LEFT JOIN post USING (pk)
  )`;
};

// ── Stage flags ─────────────────────────────────────────────────────────────

export const STAGE_TIME: Record<string, string> = {
  traffic: "t_traffic",
  activation: "t_activation",
  signup: "t_signup",
  intent: "t_intent",
  subscription: "t_subscription",
  post_sub: "t_post",
};

/**
 * The SQL condition for "reached this stage" in the given mode. Cohort mode
 * nests (every rung above too); activity mode does not.
 */
export const reachedSql = (stageKey: string, mode: PlgMode, alias = "reach"): string => {
  const idx = STAGES.findIndex((s) => s.key === stageKey);
  if (idx < 0) throw new Error(`Unknown PLG stage: ${stageKey}`);
  const own = `${alias}.${STAGE_TIME[stageKey]} IS NOT NULL`;
  if (mode === "activity") return own;
  return STAGES.slice(0, idx + 1)
    .map((s) => `${alias}.${STAGE_TIME[s.key]} IS NOT NULL`)
    .join(" AND ");
};

/** `count(*) FILTER (...) AS s_<key>` for every stage. */
export const stageCounts = (mode: PlgMode, alias = "reach"): string =>
  STAGES.map((s) => `count(*) FILTER (WHERE ${reachedSql(s.key, mode, alias)}) AS "s_${s.key}"`).join(",\n       ");

/** The IST bucket a timestamp falls into. */
export const bucketSql = (col: string, g: Granularity): string =>
  `to_char(date_trunc('${g}', ${col} AT TIME ZONE 'Asia/Kolkata'), 'YYYY-MM-DD')`;
