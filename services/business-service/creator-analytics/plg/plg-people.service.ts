// ─── PLG growth analytics — people, journeys and paths ───────────────────────
//
// Every number on the Growth views opens into the people behind it, and every
// person opens into their journey. Aggregates say where the funnel leaks;
// journeys say what the leak looks like.

import { TX_RENEWAL, num, pct } from "../creator-analytics-shared";
import { plgQuery as q } from "./plg-db";
import { ACTION_BY_KEY, REAL_SESSION, APP_UA, STAGES, SUB_FUNNELS } from "./plg-catalogue";
import { STAGE, STAGE_TIME, inList, reachedSql, type PlgFilters } from "./plg-sql";
import { runCore } from "./plg-funnel.service";
import { WITHIN_SQL, subFunnelActions, subFunnelCtes } from "./plg-analysis.service";

type Row = Record<string, unknown>;

// ── The people behind a number ──────────────────────────────────────────────

export const PEOPLE_SORTS: Record<string, string> = {
  firstSeen: "sel.first_seen",
  activatedAt: "sel.t_activation",
  signedUpAt: "sel.t_signup",
  intentAt: "sel.t_intent",
  subscribedAt: "sel.t_subscription",
  postSubAt: "sel.t_post",
  searches: "agg.searches",
  streams: "agg.streams",
  downloads: "agg.downloads",
};

export interface PeopleQuery {
  /** People who reached this stage (nested in cohort mode). */
  stage?: string | null;
  /** With `stage`: people who reached the stage ABOVE it but not this one. */
  dropped?: boolean;
  /** People who did this action inside their clock. */
  action?: string | null;
  /** With `subFunnel`: people who reached step `step` but not the next one (or, without `dropped`, who reached it). */
  subFunnel?: string | null;
  step?: number | null;
  search?: string | null;
  sort?: string | null;
  order?: "asc" | "desc";
  page: number;
  pageSize: number;
}

export const getPlgPeopleService = async (f: PlgFilters, p: PeopleQuery) => {
  const conds: string[] = [];
  const extra = new Set<string>(["search_web", "search_app", "stream", "download", "paywall_download", "pricing_entry", "checkout"]);
  let preCtes = "";

  if (p.stage) {
    const idx = STAGES.findIndex((s) => s.key === p.stage);
    if (idx < 0) throw new Error(`Unknown PLG stage: ${p.stage}`);
    if (p.dropped && idx > 0) {
      conds.push(`(${reachedSql(STAGES[idx - 1].key, f.mode, "sel")}) AND sel.${STAGE_TIME[p.stage]} IS NULL`);
    } else {
      conds.push(reachedSql(p.stage, f.mode, "sel"));
    }
  }

  if (p.action) {
    if (!ACTION_BY_KEY[p.action]) throw new Error(`Unknown PLG action: ${p.action}`);
    extra.add(p.action);
    preCtes += `,
  did AS (
    SELECT DISTINCT x.pk FROM acts x JOIN pop pp ON pp.pk = x.pk
     WHERE x.a = ${inList([p.action])} AND ${WITHIN_SQL(f)}
  )`;
    conds.push("sel.pk IN (SELECT pk FROM did)");
  }

  if (p.subFunnel) {
    const spec = SUB_FUNNELS.find((s) => s.key === p.subFunnel);
    if (!spec) throw new Error(`Unknown PLG sub-funnel: ${p.subFunnel}`);
    const step = Math.max(0, Math.min(spec.steps.length - 1, p.step ?? 0));
    subFunnelActions(spec).forEach((k) => extra.add(k));
    preCtes += `,
  ${subFunnelCtes(spec, f)}`;
    if (p.dropped && step > 0) {
      conds.push(`sel.pk IN (SELECT pk FROM sf${step - 1}) AND sel.pk NOT IN (SELECT pk FROM sf${step})`);
    } else {
      conds.push(`sel.pk IN (SELECT pk FROM sf${step})`);
    }
  }

  if (p.search) {
    conds.push(`(u.email ILIKE :search OR u.mobile ILIKE :search OR sel.pk = :searchExact
      OR (COALESCE(u."firstName", '') || ' ' || COALESCE(u."lastName", '')) ILIKE :search)`);
  }

  const sortCol = PEOPLE_SORTS[p.sort ?? "firstSeen"] ?? PEOPLE_SORTS.firstSeen;
  const order = p.order === "asc" ? "ASC" : "DESC";

  const rows = await runCore<Row>(
    "plg.people",
    f,
    `${preCtes},
  sel AS (
    SELECT r.*, pp.uid, pp.first_seen, pp.channel, pp.landing, pp.landing_path, pp.referrer_domain,
           pp.device, pp.surface, pp.auth_state, pp.plan, pp.first_action, pp.signup_method
      FROM reach r JOIN pop pp USING (pk)
  ),
  agg AS (
    SELECT x.pk,
           count(*) FILTER (WHERE x.a IN ('search_web', 'search_app')) AS searches,
           count(*) FILTER (WHERE x.a = 'stream') AS streams,
           count(*) FILTER (WHERE x.a = 'download') AS downloads,
           count(*) FILTER (WHERE x.a = 'paywall_download') AS paywalls,
           count(*) FILTER (WHERE x.a = 'checkout') AS checkouts,
           (array_agg(x.a ORDER BY x.at) FILTER (WHERE x.a IN (${inList(STAGE("intent").actions)})))[1] AS first_intent,
           (array_agg(x.d ORDER BY x.at) FILTER (WHERE x.a = 'pricing_entry'))[1] AS pricing_source
      FROM acts x JOIN pop pp ON pp.pk = x.pk
     WHERE ${WITHIN_SQL(f)}
     GROUP BY x.pk
  )
SELECT sel.pk, sel.uid, sel.first_seen, sel.t_activation, sel.t_signup, sel.t_intent,
       sel.t_subscription, sel.t_post, sel.channel, sel.landing, sel.landing_path, sel.referrer_domain,
       sel.device, sel.surface, sel.auth_state, sel.plan, sel.first_action, sel.signup_method,
       COALESCE(agg.searches, 0) AS searches, COALESCE(agg.streams, 0) AS streams,
       COALESCE(agg.downloads, 0) AS downloads, COALESCE(agg.paywalls, 0) AS paywalls,
       COALESCE(agg.checkouts, 0) AS checkouts, agg.first_intent, agg.pricing_source,
       NULLIF(btrim(COALESCE(u."firstName", '') || ' ' || COALESCE(u."lastName", '')), '') AS name,
       u.email, u.mobile,
       count(*) OVER () AS total
  FROM sel
  LEFT JOIN agg USING (pk)
  LEFT JOIN users u ON u.id = sel.uid
 ${conds.length ? `WHERE ${conds.join("\n   AND ")}` : ""}
 ORDER BY ${sortCol} ${order} NULLS LAST, sel.pk
 LIMIT :limit OFFSET :offset`,
    {
      extraActions: [...extra],
      binds: {
        limit: p.pageSize,
        offset: (p.page - 1) * p.pageSize,
        search: p.search ? `%${p.search}%` : null,
        searchExact: p.search ?? null,
      },
    },
  );

  const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : null);
  return {
    total: num(rows[0]?.total),
    page: p.page,
    pageSize: p.pageSize,
    rows: rows.map((r) => ({
      person: r.pk as string,
      userId: r.uid ? Number(r.uid) : null,
      name: (r.name as string) ?? null,
      email: (r.email as string) ?? null,
      mobile: (r.mobile as string) ?? null,
      firstSeen: iso(r.first_seen),
      activatedAt: iso(r.t_activation),
      signedUpAt: iso(r.t_signup),
      intentAt: iso(r.t_intent),
      subscribedAt: iso(r.t_subscription),
      postSubAt: iso(r.t_post),
      channel: r.channel as string,
      landing: r.landing as string,
      landingPath: (r.landing_path as string) ?? null,
      referrer: (r.referrer_domain as string) ?? null,
      device: r.device as string,
      surface: r.surface as string,
      authState: r.auth_state as string,
      plan: r.plan as string,
      firstAction: r.first_action as string,
      firstIntent: (r.first_intent as string) ?? null,
      firstIntentLabel: r.first_intent ? ACTION_BY_KEY[r.first_intent as string]?.label ?? null : null,
      pricingSource: (r.pricing_source as string) ?? null,
      signupMethod: r.signup_method as string,
      searches: num(r.searches),
      streams: num(r.streams),
      downloads: num(r.downloads),
      paywalls: num(r.paywalls),
      checkouts: num(r.checkouts),
    })),
  };
};

// ── One person's journey ────────────────────────────────────────────────────

/** Client events, in the words the timeline shows. */
const CLIENT_LABELS: Record<string, [kind: string, label: string]> = {
  PAGE_VIEW: ["page", "Viewed a page"],
  SEARCH: ["activation", "Searched"],
  FILTER_APPLIED: ["browse", "Applied a filter"],
  RAIL_IMPRESSION: ["browse", "Saw a rail"],
  RAIL_ITEM_CLICK: ["browse", "Clicked a rail item"],
  PLAYLIST_OPEN: ["browse", "Opened a playlist"],
  TRACK_PREVIEW: ["activation", "Previewed a stem"],
  TRACK_PLAY: ["activation", "Played a track"],
  TRACK_PAUSE: ["browse", "Paused"],
  TRACK_COMPLETE: ["activation", "Heard a track to the end"],
  TRACK_LIKE: ["activation", "Liked"],
  SHARE_CREATED: ["browse", "Shared"],
  FREE_PLAY_CONSUMED: ["browse", "Used a free play"],
  PLAY_GATE_SHOWN: ["intent", "Hit a gate"],
  PRICING_VIEWED: ["intent", "Reached pricing"],
  LOGIN_STARTED: ["signup", "Opened sign-in"],
  OTP_REQUESTED: ["signup", "Requested a code"],
  OTP_VERIFIED: ["signup", "Verified the code"],
  SIGNUP_STARTED: ["signup", "Started onboarding"],
  SIGNUP_COMPLETED: ["signup", "Completed onboarding"],
  LOGIN_COMPLETED: ["signup", "Logged in"],
  LOGOUT: ["browse", "Logged out"],
  ADD_TO_CART: ["intent", "Chose a plan"],
  CHECKOUT_STARTED: ["intent", "Started checkout"],
  PAYMENT_INITIATED: ["intent", "Opened payment"],
  PAYMENT_FAILED: ["intent", "Payment failed"],
  SUBSCRIPTION_STARTED: ["subscription", "Payment completed"],
  TRACK_DOWNLOAD: ["value", "Downloaded (web)"],
};

const caseOf = (idx: 0 | 1) =>
  `CASE e."eventName" ${Object.entries(CLIENT_LABELS)
    .map(([k, v]) => `WHEN '${k}' THEN '${v[idx].replace(/'/g, "''")}'`)
    .join(" ")} ELSE ${idx === 0 ? "'browse'" : `initcap(replace(lower(e."eventName"), '_', ' '))`} END`;

const JOURNEY_SQL = `
WITH vids AS (
  SELECT DISTINCT "visitorId" AS vid FROM native_sessions WHERE "userId" = :uid
  UNION
  SELECT CAST(:vid AS text) WHERE CAST(:vid AS text) IS NOT NULL
)
SELECT * FROM (
  SELECT s."startedAt" AS at, 'visit' AS kind,
         CASE WHEN s."userId" IS NULL THEN 'Visited (signed out)' ELSE 'Visited (signed in)' END AS label,
         concat_ws(' · ', 'landed on ' || split_part(s."landingPath", '?', 1),
                   'from ' || s."referrerDomain", s."utmSource", s."deviceType", s.os, s.browser) AS detail,
         'web' AS surface
    FROM native_sessions s
   WHERE (s."visitorId" IN (SELECT vid FROM vids) OR s."userId" = :uid)
     AND ${REAL_SESSION("s")}
  UNION ALL
  SELECT e."occurredAt", ${caseOf(0)}, ${caseOf(1)},
         concat_ws(' · ',
           CASE WHEN e."eventName" = 'PAGE_VIEW' THEN e.path END,
           e.properties->>'query',
           (e.properties->>'results') || ' results',
           e.properties->>'trackCode', e.properties->>'reason', e.properties->>'entry_source',
           e.properties->>'surface', e.properties->>'channel', e.properties->>'plan_code',
           e.properties->>'signup_method', e.properties->>'tab'),
         'web'
    FROM native_events e
   WHERE e.source = 'CLIENT'
     AND (e."visitorId" IN (SELECT vid FROM vids) OR e."userId" = :uid)
  UNION ALL
  SELECT e."occurredAt",
         CASE WHEN e.endpoint LIKE '/channel-whitelist%' THEN 'value'
              WHEN e."statusCode" = 402 THEN 'intent'
              WHEN e.endpoint LIKE '/subscription/checkout%' THEN 'intent'
              ELSE 'value' END,
         CASE WHEN e.endpoint LIKE '/downloads/license%' AND e."statusCode" = 402 THEN 'Download blocked by paywall'
              WHEN e.endpoint LIKE '/downloads/license%' THEN 'Download requested'
              WHEN e.endpoint LIKE '/stems/%' AND e."statusCode" = 402 THEN 'Stems blocked by paywall'
              WHEN e.endpoint LIKE '/mixer/%' AND e."statusCode" = 402 THEN 'Mixer blocked by paywall'
              WHEN e.endpoint LIKE '/subscription/checkout%' THEN 'Checkout opened'
              WHEN e.endpoint LIKE '/channel-whitelist%' THEN 'Whitelisted a channel'
              ELSE e.method || ' ' || e.endpoint END,
         e.method || ' ' || e.endpoint || ' → ' || e."statusCode",
         'web'
    FROM native_events e
   WHERE :uid IS NOT NULL AND e."userId" = :uid
     AND e."eventName" IN ('API_CALL', 'API_ERROR') AND e.method = 'POST'
     AND (e.endpoint LIKE '/downloads/license%' OR e.endpoint LIKE '/stems/download%'
          OR e.endpoint LIKE '/mixer/mix%' OR e.endpoint LIKE '/subscription/checkout%'
          OR e.endpoint LIKE '/channel-whitelist%')
     AND (e."statusCode" < 300 OR e."statusCode" = 402)
  UNION ALL
  SELECT u."createdAt", 'signup', 'Account created', concat_ws(' · ', u.email, u.city, u.state), 'any'
    FROM users u WHERE u.id = :uid AND u."createdAt" IS NOT NULL
  UNION ALL
  SELECT u."onboardedAt", 'signup', 'Completed onboarding', NULL, 'any'
    FROM users u WHERE u.id = :uid AND u."onboardedAt" IS NOT NULL
  UNION ALL
  SELECT us."createdAt", 'visit', 'Logged in to the app',
         concat_ws(' · ', us.os, us."deviceType"), 'app'
    FROM user_sessions us WHERE us."userId" = :uid AND us.${APP_UA}
  UNION ALL
  SELECT us."createdAt", 'visit', 'Logged in (non-app client)', concat_ws(' · ', us.os, us.browser), 'any'
    FROM user_sessions us WHERE us."userId" = :uid AND NOT (us.${APP_UA})
  UNION ALL
  SELECT DISTINCT ON (date_trunc('minute', r.created_at), lower(r.query))
         r.created_at, 'activation', 'Searched (search service)', r.query, 'any'
    FROM rec_events r
   WHERE r.user_id = :uid AND r.surface = 'aienterpriseSearch'
  UNION ALL
  SELECT x."licensedAt", 'value', 'Downloaded', concat_ws(' · ', COALESCE(x.type, 'track'), x."trackCode"), 'any'
    FROM licenses x WHERE x."userId" = :uid AND x."brandId" IS NULL
  UNION ALL
  SELECT us."createdAt",
         CASE WHEN us."currentPeriodStart" IS NOT NULL THEN 'subscription' ELSE 'intent' END,
         CASE WHEN us."currentPeriodStart" IS NOT NULL THEN 'Subscribed' ELSE 'Checkout (never activated)' END,
         concat_ws(' · ', us."planCode", us."paymentProvider", us.status), 'any'
    FROM user_subscriptions us WHERE us."userId" = :uid
  UNION ALL
  SELECT us."cancelledAt", 'retention', 'Subscription ended', concat_ws(' · ', us."planCode", us.status), 'any'
    FROM user_subscriptions us WHERE us."userId" = :uid AND us."cancelledAt" IS NOT NULL AND us."currentPeriodStart" IS NOT NULL
  UNION ALL
  SELECT t."createdAt", 'subscription',
         CASE WHEN ${TX_RENEWAL} IS TRUE THEN 'Renewal paid' ELSE 'Payment captured' END,
         concat_ws(' · ', 'Rs ' || round(t."payAmount"::numeric), t.kind, t.status), 'any'
    FROM transactions t WHERE t."userId" = :uid AND lower(coalesce(t.status, '')) IN ('captured', 'paid', 'success')
  UNION ALL
  SELECT l."createdAt", 'activation', 'Liked a track', l."trackCode", 'any'
    FROM user_liked_tracks l WHERE l."userId" = :uid
  UNION ALL
  SELECT c."createdAt" AT TIME ZONE 'UTC', 'activation', 'Created a collection', c.name, 'any'
    FROM collections c WHERE c."userId" = :uid
  UNION ALL
  SELECT p."createdAt", 'activation', 'Created a project', concat_ws(' · ', p.name, p.status), p.platform
    FROM sound_projects p WHERE p."userId" = :uid
  UNION ALL
  SELECT v."createdAt", 'value', 'Claimed a video', concat_ws(' · ', v.status, v.url), 'any'
    FROM video_links v WHERE v."userId" = :uid
  UNION ALL
  SELECT sp."whitelistUpdatedAt", 'value', 'Channel whitelist: ' || sp."whitelistStatus",
         concat_ws(' · ', sp.source, sp."platformHandle"), 'any'
    FROM soundtracking_user_profiles sp WHERE sp."userId" = :uid AND sp."whitelistUpdatedAt" IS NOT NULL
  UNION ALL
  SELECT m.created_at, 'value', 'Exported a mix', concat_ws(' · ', m.track_code, m.format, m.status), 'any'
    FROM creator_mixer_downloads m WHERE m.user_id = :uid
) t
WHERE t.at IS NOT NULL
ORDER BY t.at DESC
LIMIT :limit`;

/**
 * Accepts a user id (`123` or `u123`), a browser id (`v…`), an email or a
 * mobile number.
 */
export const resolvePerson = async (
  person: string,
): Promise<{ uid: number | null; vid: string | null }> => {
  const p = person.trim();
  if (/^u?\d+$/.test(p) && p.replace(/^u/, "").length < 12) return { uid: Number(p.replace(/^u/, "")), vid: null };
  if (/^v./.test(p)) {
    const vid = p.slice(1);
    const [row] = await q<{ uid: string | null }>(
      `SELECT "userId" AS uid FROM native_sessions
        WHERE "visitorId" = :vid AND "userId" IS NOT NULL
        ORDER BY "startedAt" LIMIT 1`,
      { vid },
    );
    return { uid: row?.uid ? Number(row.uid) : null, vid };
  }
  const [row] = await q<{ id: string }>(
    p.includes("@")
      ? `SELECT id FROM users WHERE lower(email) = lower(:p) AND platform = 'CREATOR' ORDER BY id LIMIT 1`
      : `SELECT id FROM users WHERE platform = 'CREATOR'
           AND regexp_replace(COALESCE(mobile, ''), '\\D', '', 'g') LIKE '%' || right(regexp_replace(:p, '\\D', '', 'g'), 10)
           AND length(regexp_replace(:p, '\\D', '', 'g')) >= 10
         ORDER BY id LIMIT 1`,
    { p },
  );
  return { uid: row ? Number(row.id) : null, vid: null };
};

export const getPlgJourneyService = async (person: string, limit = 1500) => {
  const who = await resolvePerson(person);
  if (!who.uid && !who.vid) {
    return { person, found: false, profile: null, milestones: [], events: [] };
  }
  const [events, profileRows] = await Promise.all([
    q<{ at: string; kind: string; label: string; detail: string | null; surface: string }>(JOURNEY_SQL, {
      uid: who.uid,
      vid: who.vid,
      limit,
    }),
    who.uid
      ? q<Row>(
          `SELECT u.id, NULLIF(btrim(COALESCE(u."firstName", '') || ' ' || COALESCE(u."lastName", '')), '') AS name,
                  u.email, u.mobile, u.status, u.city, u.state, u."createdAt", u."onboardedAt", u."lastLoginAt",
                  (SELECT us."planCode" || ' · ' || us.status FROM user_subscriptions us
                    WHERE us."userId" = u.id AND us."currentPeriodStart" IS NOT NULL
                    ORDER BY us."createdAt" DESC LIMIT 1) AS subscription
             FROM users u WHERE u.id = :uid`,
          { uid: who.uid },
        )
      : Promise.resolve([] as Row[]),
  ]);

  const asc = [...events].reverse();
  const firstOf = (pred: (e: (typeof events)[number]) => boolean) => asc.find(pred)?.at ?? null;
  const milestones = [
    { key: "first_visit", label: "First visit", at: firstOf((e) => e.kind === "visit") },
    { key: "first_activation", label: "First search or play", at: firstOf((e) => e.kind === "activation") },
    { key: "signup", label: "Account created", at: firstOf((e) => e.label === "Account created") },
    { key: "first_intent", label: "First sign of intent", at: firstOf((e) => e.kind === "intent") },
    { key: "subscribed", label: "Subscribed", at: firstOf((e) => e.label === "Subscribed") },
    { key: "first_value", label: "First value after subscribing", at: null as string | null },
  ];
  const subAt = milestones[4].at;
  if (subAt) {
    milestones[5].at = asc.find((e) => e.kind === "value" && e.at >= subAt)?.at ?? null;
  }

  return {
    person,
    found: true,
    userId: who.uid,
    visitorId: who.vid,
    profile: profileRows[0] ?? null,
    truncated: events.length >= limit,
    milestones,
    events,
  };
};

// ── Common paths ────────────────────────────────────────────────────────────

/** The milestones a path is written in, and the short word for each. */
// Visits are deliberately absent: being on the platform is the premise of
// every path, and session start times can trail the first page event by a few
// seconds, which put "Visit" after actions it preceded.
const PATH_WORDS: Record<string, string> = {
  search_web: "Search",
  search_app: "Search",
  stream: "Play",
  save: "Save",
  free_plays_out: "Free plays out",
  auth_prompt: "Sign-in opened",
  account_created: "Sign up",
  pricing_view: "Pricing",
  paywall_download: "Download paywall",
  locked_feature: "Paid feature",
  checkout: "Checkout",
  subscribed: "Subscribe",
  download: "Download",
  whitelist: "Whitelist",
};

export const PATH_TARGETS: Record<string, { label: string; question: string }> = {
  subscribed: { label: "Subscribed", question: "What did people do, in order, before subscribing?" },
  signup: { label: "Signed up", question: "What did people do, in order, before creating an account?" },
  signup_abandoned: { label: "Abandoned sign-in", question: "What did people who opened sign-in but never got an account do?" },
  checkout_abandoned: { label: "Abandoned checkout", question: "What did people who started checkout but never subscribed do?" },
  intent_no_sub: { label: "Intent, no subscription", question: "What did people who showed intent but did not subscribe do?" },
};

export const getPlgPathsService = async (f: PlgFilters, target: string, limit = 15) => {
  const t = PATH_TARGETS[target];
  if (!t) throw new Error(`Unknown PLG path target: ${target}`);
  const keys = Object.keys(PATH_WORDS);
  const word = `CASE x.a ${Object.entries(PATH_WORDS)
    .map(([k, w]) => `WHEN '${k}' THEN '${w}'`)
    .join(" ")} END`;

  const tgt: Record<string, string> = {
    subscribed: `SELECT r.pk, r.t_subscription AS t_end FROM reach r WHERE r.t_subscription IS NOT NULL`,
    signup: `SELECT r.pk, r.t_signup AS t_end FROM reach r WHERE r.t_signup IS NOT NULL`,
    signup_abandoned: `SELECT r.pk, 'infinity'::timestamptz AS t_end FROM reach r
       WHERE r.t_signup IS NULL AND r.pk IN (SELECT pk FROM ms WHERE m = 'Sign-in opened')`,
    checkout_abandoned: `SELECT r.pk, 'infinity'::timestamptz AS t_end FROM reach r
       WHERE r.t_subscription IS NULL AND r.pk IN (SELECT pk FROM ms WHERE m = 'Checkout')`,
    intent_no_sub: `SELECT r.pk, 'infinity'::timestamptz AS t_end FROM reach r
       WHERE r.t_intent IS NOT NULL AND r.t_subscription IS NULL`,
  };

  const rows = await runCore<Row>(
    `plg.paths.${target}`,
    f,
    `,
  ms AS MATERIALIZED (
    SELECT x.pk, ${word} AS m, min(x.at) AS t
      FROM acts x JOIN pop pp ON pp.pk = x.pk
     WHERE x.a IN (${inList(keys)}) AND ${WITHIN_SQL(f)}
     GROUP BY x.pk, 2
  ),
  tgt AS (${tgt[target]}),
  seq AS (
    SELECT ms.pk, string_agg(ms.m, ' → ' ORDER BY ms.t, ms.m) AS path, count(*) AS steps
      FROM ms JOIN tgt USING (pk)
     WHERE ms.t <= tgt.t_end
     GROUP BY ms.pk
  )
SELECT path, count(*) AS people, (SELECT count(*) FROM tgt) AS total,
       round(avg(steps), 1) AS avg_steps
  FROM seq
 GROUP BY path
 ORDER BY people DESC, path
 LIMIT ${Math.max(1, Math.floor(limit))}`,
    { extraActions: keys },
  );
  const total = num(rows[0]?.total);
  return {
    target,
    label: t.label,
    question: t.question,
    total,
    paths: rows.map((r) => ({
      path: r.path as string,
      steps: (r.path as string).split(" → "),
      people: num(r.people),
      share: pct(num(r.people), total),
    })),
    note:
      "A path is the ORDER in which a person first did each milestone, up to the outcome. Repeats and plain visits are not shown.",
  };
};
