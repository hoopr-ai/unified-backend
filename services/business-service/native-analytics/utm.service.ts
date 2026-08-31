// ─── UTM & campaign analytics ────────────────────────────────────────────────
//
// The marketing read of the same session data the rest of this folder reports
// on: which campaigns bring traffic, and which of them bring people who sign up
// and pay. It exists as its own service (and its own dashboard) because it
// answers a different question from `audience.service.ts`'s Acquisition view.
// That one ranks traffic sources by sessions. This one carries a session
// through to a signup and to money, which is the only version of the number
// anyone can spend against.
//
// ── TWO CLOCKS, AND WHY EVERY ROW CARRIES BOTH ──────────────────────────────
//
// A campaign row here mixes two populations on purpose, and the UI labels them
// as such:
//
//   TRAFFIC columns (sessions, visitors, bounce, duration) count SESSIONS THAT
//   STARTED IN THE WINDOW and carried that UTM value. This is the "how much did
//   this campaign run" number.
//
//   OUTCOME columns (signups, subscribers, revenue) count PEOPLE WHOSE FIRST
//   EVER TOUCH was in the window and carried that UTM value — and then follow
//   those people forward with no end date. This is the "what did that spend
//   buy" number.
//
// They are deliberately not the same denominator. A campaign that ran in
// January and produced a subscriber in March should get credit for that
// subscriber when you look at January, or you can never judge January. Reporting
// both on one row, clearly labelled, is more honest than picking one and
// quietly making the other unavailable.
//
// ── ATTRIBUTION MODEL: FIRST TOUCH, BY VISITOR ──────────────────────────────
//
// Attribution keys on `visitorId`, not `userId`, because the UTM lands on the
// ANONYMOUS session — someone clicks an ad, browses, and signs up two sessions
// later, by which time the campaign parameters are long gone from the URL. The
// visitor id (the httpOnly `hoopr_vid` cookie) is the only thing that spans
// both, so:
//
//   1. `first_touch` — visitors whose FIRST EVER session falls in the window,
//      and the UTMs that session carried.
//   2. `visitor_user`  — the first account each visitor ever became.
//   3. the account inherits the campaign that first brought the browser here.
//
// "First ever" is not the same as "first in the window", and the difference is
// where first-touch attribution usually goes quietly wrong: a returning visitor
// whose earliest session predates the window must NOT count as a fresh first
// touch. That is enforced by the `NOT EXISTS` prior-session check rather than by
// scanning all history — see `attributionCtes` for why that formulation is the
// one the indexes can actually answer.
//
// ── POPULATION ──────────────────────────────────────────────────────────────
//
// CREATOR surface only, via `creatorScope`. Note that this KEEPS anonymous
// sessions (`userPlatform IS NULL`) — filtering on `= 'CREATOR'` would throw
// away 96.6% of campaign traffic, because a UTM arrives before the visitor is
// anyone. The docstring on `creatorScope` has the numbers.
//
// ── MONEY ───────────────────────────────────────────────────────────────────
//
// Revenue expressions are copied from NATIVE-BE's
// `subscriptions-admin.constants.ts` rather than re-derived. Two internal
// dashboards that disagree about MRR is a support ticket nobody can close, and
// the same warning already sits at the top of native-analytics-shared.ts about
// IST day boundaries. If those constants change, change these with them.

import {
  q,
  num,
  pct,
  round1,
  per,
  filterBinds,
  sessionWhere,
  previousPeriod,
  delta,
  type NativeFilters,
} from "./native-analytics-shared";

// ── money expressions, mirrored from NATIVE-BE ──────────────────────────────

/**
 * "Real money" for MRR purposes: a subscription with a payment instrument
 * behind it. A row with neither a Razorpay subscription nor an Apple original
 * transaction id was granted internally (the comp batches) and must not inflate
 * a campaign's return.
 */
const PAID_EXPR = `(sub."razorpaySubscriptionId" IS NOT NULL OR sub."appleOriginalTxId" IS NOT NULL)`;

/** Monthly-equivalent price, annual plans divided down. */
const MRR_EXPR = `
  (COALESCE(p."basePriceRupees", 0)
     + COALESCE(p."addonPriceRupees", 0) * COALESCE(sub."extraChannelCount", 0))
  / CASE WHEN p."billingCycle" = 'year' THEN 12.0 ELSE 1.0 END`;

/**
 * Which transactions are money that actually arrived.
 *
 * NOTE, and it matters for how these numbers are read: `razorpayPaymentId IS
 * NOT NULL` scopes this to Razorpay collections, so Apple IAP revenue is NOT in
 * `revenueRupees`. That is the same scope NATIVE-BE's revenue dashboard uses,
 * so the two agree — but for a campaign that drove iOS installs, MRR is the
 * column to read, not revenue. The dashboard says so on the card.
 */
const TX_PAID = `t."razorpayPaymentId" IS NOT NULL
                 AND lower(coalesce(t.status, '')) IN ('captured', 'paid', 'success')`;

// ── dimensions ──────────────────────────────────────────────────────────────

/**
 * What a breakdown row can be grouped by.
 *
 * A fixed map, never interpolation of the request value: `dimension` arrives
 * from the query string, and the Joi schema validates it against these keys
 * before it reaches here. Two locks on the same door, because this is the one
 * place in the module where a request value reaches SQL structure rather than a
 * bind.
 *
 * Every expression COALESCEs to a printable sentinel rather than leaving NULL:
 * a GROUP BY that drops its null bucket silently under-reports the untagged
 * traffic, and untagged traffic is the single biggest thing this dashboard has
 * to show (99.8% of sessions, at time of writing).
 */
const DIMENSIONS: Record<string, { sql: string; label: string }> = {
  source: { sql: `COALESCE(s."utmSource", '(not set)')`, label: "utm_source" },
  medium: { sql: `COALESCE(s."utmMedium", '(not set)')`, label: "utm_medium" },
  campaign: {
    sql: `COALESCE(s."utmCampaign", '(not set)')`,
    label: "utm_campaign",
  },
  content: { sql: `COALESCE(s."utmContent", '(not set)')`, label: "utm_content" },
  term: { sql: `COALESCE(s."utmTerm", '(not set)')`, label: "utm_term" },
  // The pair marketers actually plan against — "google / cpc" is a channel in a
  // way that "google" on its own is not.
  sourceMedium: {
    sql: `COALESCE(s."utmSource", '(not set)') || ' / ' || COALESCE(s."utmMedium", '(not set)')`,
    label: "utm_source / utm_medium",
  },
  landingPath: {
    sql: `COALESCE(s."landingPath", '(unknown)')`,
    label: "landing page",
  },
  referrerDomain: {
    sql: `COALESCE(s."referrerDomain", '(direct)')`,
    label: "referring domain",
  },
  channel: { sql: "", label: "channel" }, // filled below — needs CHANNEL_SQL
};

/**
 * Every session bucketed into one marketing channel.
 *
 * Ordered strongest-evidence-first, and the order is the whole design:
 *
 *   · A click id (gclid / fbclid) outranks the UTM string, because it is minted
 *     by the ad platform and cannot be typo'd by whoever built the link. This is
 *     what stops auto-tagged Google Ads traffic — which arrives with a gclid and
 *     NO utm_source at all — from being filed under Direct. On current prod that
 *     is most of the paid search traffic, so getting this rung wrong would hide
 *     the entire Google Ads spend.
 *   · The referral programme (`refCode` / `shareToken`, from the same
 *     `hoopr_ref` cookie native_referrals uses) outranks a bare referrer, so
 *     creator-driven signups are never miscounted as organic social.
 *   · Search and social referrers are only consulted once no campaign tagging
 *     of any kind is present.
 *
 * `~*` is a case-insensitive regex match, deliberately: prod already carries
 * both `Paid_Search` and `paid_search`, and both `Google` and `google`. A
 * channel split that treats those as different things is useless — which is
 * also why the hygiene view exists to get them fixed at the source.
 */
const CHANNEL_SQL = `
  CASE
    WHEN s.gclid IS NOT NULL                                          THEN 'Paid search'
    WHEN s.fbclid IS NOT NULL                                         THEN 'Paid social'
    WHEN s."refCode" IS NOT NULL OR s."shareToken" IS NOT NULL        THEN 'Referral programme'
    WHEN s."utmMedium" ~* '^(cpc|ppc|paid[_-]?search|sem)$'           THEN 'Paid search'
    WHEN s."utmMedium" ~* '(paid|cpm|display|banner|video[_-]?ad)'    THEN 'Paid social'
    WHEN s."utmMedium" ~* '(email|newsletter|edm|mailer)'             THEN 'Email'
    WHEN s."utmMedium" ~* '(social|whatsapp|influencer)'              THEN 'Organic social'
    WHEN s."utmMedium" ~* '(affiliate|partner|pr|article)'            THEN 'Partnerships'
    WHEN s."utmSource" IS NOT NULL OR s."utmCampaign" IS NOT NULL     THEN 'Other campaign'
    WHEN s."referrerDomain" ~* '(google|bing|duckduckgo|brave|yahoo|ecosia|yandex)'
                                                                      THEN 'Organic search'
    WHEN s."referrerDomain" ~* '(facebook|instagram|youtube|twitter|^t\\.co|linkedin|reddit|pinterest|threads|snapchat)'
                                                                      THEN 'Organic social'
    WHEN s."referrerDomain" ~* '(chatgpt|perplexity|claude|copilot|gemini)'
                                                                      THEN 'AI assistants'
    WHEN s."referrerDomain" IS NOT NULL                               THEN 'Referral sites'
    ELSE 'Direct / none'
  END`;

DIMENSIONS.channel.sql = CHANNEL_SQL;

export type UtmDimension = keyof typeof DIMENSIONS;

/** The dimension keys the Joi schema validates against. */
export const UTM_DIMENSIONS = Object.keys(DIMENSIONS);

/** Filters every UTM endpoint accepts, on top of the shared four. */
export interface UtmFilters extends NativeFilters {
  dimension?: string;
  /** Narrow to one campaign / source / medium before grouping. */
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  /** Drop the untagged bulk, so a campaign table isn't one giant row. */
  taggedOnly?: boolean;
  limit?: number;
}

/**
 * Extra WHERE clauses for the UTM-specific narrowing.
 *
 * Written as `(CAST(:x AS text) IS NULL OR ...)` like the shared helpers, so
 * there is still exactly one SQL string per endpoint rather than one assembled
 * from fragments.
 *
 * The comparison is case-insensitive (`lower(...)`) for the same reason
 * CHANNEL_SQL uses `~*`: someone clicking through from a row labelled `Google`
 * must not get an empty drill-down because the sessions underneath were tagged
 * `google`.
 */
const utmWhere = (f: UtmFilters, alias = "s"): string => `
  AND (CAST(:utmSource AS text) IS NULL
       OR lower(COALESCE(${alias}."utmSource", '(not set)')) = lower(:utmSource))
  AND (CAST(:utmMedium AS text) IS NULL
       OR lower(COALESCE(${alias}."utmMedium", '(not set)')) = lower(:utmMedium))
  AND (CAST(:utmCampaign AS text) IS NULL
       OR lower(COALESCE(${alias}."utmCampaign", '(not set)')) = lower(:utmCampaign))
  ${
    f.taggedOnly
      ? `AND (${alias}."utmSource" IS NOT NULL OR ${alias}."utmCampaign" IS NOT NULL
             OR ${alias}."utmMedium" IS NOT NULL OR ${alias}.gclid IS NOT NULL
             OR ${alias}.fbclid IS NOT NULL)`
      : ""
  }`;

const utmBinds = (f: UtmFilters): Record<string, unknown> => ({
  ...filterBinds(f),
  utmSource: f.utmSource ?? null,
  utmMedium: f.utmMedium ?? null,
  utmCampaign: f.utmCampaign ?? null,
});

/**
 * Restricts the population to the CREATOR surface.
 *
 * `native_sessions` is written only by creator-web and creator-mobile, so it is
 * already almost entirely creator traffic — but not quite: 7 sessions on prod
 * carry `userPlatform = 'ENTERPRISE'` (an enterprise user who happened to open
 * a creator page). This excludes them, so the dashboard means what its title
 * says rather than being creator-only by accident.
 *
 * NULL IS KEPT, and that is the whole point of writing it this way rather than
 * as `= 'CREATOR'`. `userPlatform` is copied from the user record when the
 * session is stitched to an account, so it is NULL for every ANONYMOUS session
 * — and a UTM by definition lands on an anonymous first visit, before the
 * visitor is anyone at all. On prod, 1,776 of the 1,839 sessions carrying a
 * utm_source have `userPlatform IS NULL`. A plain `= 'CREATOR'` filter would
 * therefore discard 96.6% of all campaign traffic and leave this dashboard
 * reporting on 63 sessions.
 *
 * Both spellings are accepted because the raw table stores 'CREATOR' while the
 * rollups (and `normalizePlatform`) use the older 'SOUND_TRACKING_APP'.
 */
const creatorScope = (alias = "s"): string => `
  AND (${alias}."userPlatform" IS NULL
       OR ${alias}."userPlatform" IN ('CREATOR', 'SOUND_TRACKING_APP'))`;

/**
 * The attribution CTEs, shared by every outcome query in this file.
 *
 * ── WHY first_touch IS WINDOWED RATHER THAN GLOBAL ──────────────────────────
 *
 * The obvious way to write "each visitor's first ever session" is a global
 * `DISTINCT ON (visitorId) ... ORDER BY visitorId, startedAt`. That was the
 * first version of this, and it was too slow to use.
 *
 * The reason is in the DDL: `native_sessions_visitor_idx` is
 * `("visitorId", "startedAt" DESC)`. A DESC index cannot serve an ASC ordering
 * — scanning it backwards yields (visitorId DESC, startedAt ASC), which is not
 * what DISTINCT ON needs — so Postgres had to sort all ~900k rows, on every
 * request, four times over on the Overview alone.
 *
 * The rewrite states the same thing in a form the indexes can answer: a
 * visitor's first touch is in the window IFF they have a session in the window
 * AND no session before it. So scan only the window (`native_sessions_started_idx`,
 * a few tens of thousands of rows), then probe the visitor index once per
 * candidate to rule out an earlier session. The sort that remains is over the
 * window, not over the table.
 *
 * `NOT EXISTS` rather than a LEFT JOIN ... IS NULL: it short-circuits on the
 * first prior session found, which for a returning visitor is immediate.
 *
 * ── visitor_user IS A CTE, NOT A LATERAL ────────────────────────────────────
 *
 * This one was written as a LATERAL first, on the reasoning that one index seek
 * per first-touch row beats materialising every identified visitor in the
 * table. Measured on prod, that reasoning was wrong and the difference is not
 * small: LATERAL 10.4s, CTE + hash join 4.1s, identical results.
 *
 * The reason is the row counts. `first_touch` over a full window is ~722k rows,
 * so the LATERAL pays 722k index probes; the CTE materialises only the ~117k
 * IDENTIFIED sessions (13% of the table) and the hash join then costs one pass.
 * The seek-per-row shape only wins when the driving side is small, and here it
 * is the largest thing in the query.
 *
 * If you are tempted to switch this back, benchmark it first — the intuition
 * genuinely points the wrong way.
 *
 * `paid_tx` and `live_subs` are aggregate CTEs for a related reason: they are
 * small tables, and the alternative is a correlated subquery re-scanning
 * `transactions` for every campaign in the table.
 */
const attributionCtes = (f: UtmFilters): string => `
  first_touch AS (
    SELECT DISTINCT ON (s."visitorId")
           s."visitorId", s."startedAt", s."userPlatform", s."clientType", s.os,
           s."utmSource", s."utmMedium", s."utmCampaign", s."utmContent", s."utmTerm",
           s.gclid, s.fbclid, s."refCode", s."shareToken",
           s."landingPath", s."referrerDomain",
           ${CHANNEL_SQL} AS channel
      FROM native_sessions s
     WHERE NOT s."isBot"
       AND s."startedAt" >= ((:startDate)::date)::timestamp AT TIME ZONE 'Asia/Kolkata'
       AND s."startedAt" < ((:endDate)::date + 1)::timestamp AT TIME ZONE 'Asia/Kolkata'
       ${creatorScope("s")}
       AND NOT EXISTS (
         SELECT 1
           FROM native_sessions prior
          WHERE prior."visitorId" = s."visitorId"
            AND NOT prior."isBot"
            AND prior."startedAt" < ((:startDate)::date)::timestamp AT TIME ZONE 'Asia/Kolkata'
       )
     ORDER BY s."visitorId", s."startedAt"
  ),
  visitor_user AS (
    SELECT DISTINCT ON (s."visitorId") s."visitorId", s."userId"
      FROM native_sessions s
     WHERE s."userId" IS NOT NULL AND NOT s."isBot"
     ORDER BY s."visitorId", s."startedAt"
  ),
  paid_tx AS (
    SELECT t."userId"::bigint AS uid,
           SUM(t."totalAmount") AS collected,
           COUNT(*)             AS payments
      FROM transactions t
     WHERE ${TX_PAID}
     GROUP BY 1
  ),
  live_subs AS (
    SELECT sub."userId"::bigint AS uid,
           COUNT(*) FILTER (WHERE sub.status IN ('active','past_due'))      AS live,
           COUNT(*) FILTER (WHERE ${PAID_EXPR})                             AS paid_subs,
           COALESCE(SUM(${MRR_EXPR}) FILTER (WHERE sub.status IN ('active','past_due')
                                               AND ${PAID_EXPR}), 0)        AS mrr
      FROM user_subscriptions sub
      LEFT JOIN subscription_plans p ON p.code = sub."planCode"
     GROUP BY 1
  )`;

/**
 * The join that resolves a first-touch visitor to the account they became.
 *
 * Written once here because it appears in every outcome query and must stay
 * identical in all of them — a second copy that drifted would give two
 * different signup counts on two pages of the same dashboard.
 */
const VISITOR_USER_JOIN = `
  LEFT JOIN visitor_user vu ON vu."visitorId" = ft."visitorId"
  LEFT JOIN paid_tx px      ON px.uid = vu."userId"
  LEFT JOIN live_subs ls    ON ls.uid = vu."userId"`;

/**
 * The filter predicate applied to a first-touch row.
 *
 * The DATE WINDOW is no longer here — it moved inside the CTE, which is what
 * makes the query fast. What remains is the dimension narrowing, which cannot
 * move: it has to apply after the first touch has been picked, or filtering by
 * campaign would change WHICH session counts as the first touch.
 *
 * `isBot` is not repeated — the CTE excluded bots when it picked the first
 * touch, and re-testing it here would be a no-op that reads like a second,
 * different rule.
 */
const firstTouchWhere = (f: UtmFilters): string => `
  (CAST(:userPlatform AS text) IS NULL OR COALESCE(ft."userPlatform", 'UNKNOWN') = :userPlatform)
  AND (CAST(:clientType AS text) IS NULL OR COALESCE(ft."clientType", 'UNKNOWN') = :clientType)
  AND (CAST(:os AS text) IS NULL OR COALESCE(ft.os, 'UNKNOWN') = :os)
  ${utmWhere(f, "ft")}`;

// ── overview ────────────────────────────────────────────────────────────────

/**
 * The headline: how much tagged traffic there was, what it converted at, and
 * how the channels split — with a previous-period delta on each tile.
 *
 * `taggedShare` leads the response because it is the number that decides
 * whether anything else on this dashboard can be trusted. If 0.2% of sessions
 * carry a UTM, then "top campaign" is a statement about 0.2% of the business,
 * and the dashboard has to say so rather than let a reader assume otherwise.
 */
export const getUtmOverviewService = async (f: UtmFilters) => {
  const binds = utmBinds(f);

  const totalsSql = `
    SELECT count(*)                                                  AS sessions,
           count(DISTINCT s."visitorId")                             AS visitors,
           count(*) FILTER (WHERE s."utmSource" IS NOT NULL
                              OR s."utmCampaign" IS NOT NULL
                              OR s."utmMedium" IS NOT NULL)          AS tagged,
           count(*) FILTER (WHERE s.gclid IS NOT NULL)               AS gclid,
           count(*) FILTER (WHERE s.fbclid IS NOT NULL)              AS fbclid,
           count(*) FILTER (WHERE s."refCode" IS NOT NULL
                              OR s."shareToken" IS NOT NULL)         AS referral_programme,
           count(*) FILTER (WHERE s."referrerDomain" IS NOT NULL)    AS with_referrer,
           count(*) FILTER (WHERE s."userId" IS NOT NULL)            AS identified,
           count(*) FILTER (WHERE s."isBounce")                      AS bounces,
           count(*) FILTER (WHERE s."endedAt" IS NOT NULL)           AS closed,
           COALESCE(avg(s."durationSeconds"), 0)                     AS avg_duration
      FROM native_sessions s
     WHERE ${sessionWhere("s")} ${creatorScope("s")} ${utmWhere(f)}`;

  // Outcomes for the visitors first touched in this window, tagged or not.
  const outcomeSql = `
    WITH ${attributionCtes(f)}
    SELECT count(*)                                                  AS first_touches,
           count(vu."userId")                                        AS signups,
           count(*) FILTER (WHERE ls.live > 0)                       AS subscribers,
           COALESCE(sum(px.collected), 0)                            AS revenue,
           COALESCE(sum(ls.mrr), 0)                                  AS mrr
      FROM first_touch ft
      ${VISITOR_USER_JOIN}
     WHERE ${firstTouchWhere(f)}`;

  const channelSql = `
    SELECT ${CHANNEL_SQL}                     AS channel,
           count(*)                           AS sessions,
           count(DISTINCT s."visitorId")      AS visitors,
           count(*) FILTER (WHERE s."userId" IS NOT NULL) AS identified
      FROM native_sessions s
     WHERE ${sessionWhere("s")} ${creatorScope("s")} ${utmWhere(f)}
     GROUP BY 1
     ORDER BY sessions DESC`;

  const prev = previousPeriod(f);
  const prevBinds = { ...binds, startDate: prev.startDate, endDate: prev.endDate };

  const [current, previous, outcomes, prevOutcomes, channels] = await Promise.all([
    q<Record<string, unknown>>(totalsSql, binds),
    q<Record<string, unknown>>(totalsSql, prevBinds),
    q<Record<string, unknown>>(outcomeSql, binds),
    q<Record<string, unknown>>(outcomeSql, prevBinds),
    q<Record<string, unknown>>(channelSql, binds),
  ]);

  const c = current[0] ?? {};
  const p = previous[0] ?? {};
  const o = outcomes[0] ?? {};
  const po = prevOutcomes[0] ?? {};

  const sessions = num(c.sessions);
  const tagged = num(c.tagged);
  const signups = num(o.signups);
  const firstTouches = num(o.first_touches);
  const subscribers = num(o.subscribers);
  const revenue = num(o.revenue);

  const channelTotal = channels.reduce((sum, r) => sum + num(r.sessions), 0);

  return {
    totals: {
      sessions,
      visitors: num(c.visitors),
      taggedSessions: tagged,
      /** The trust dial. Everything else here describes this slice only. */
      taggedShare: pct(tagged, sessions),
      gclidSessions: num(c.gclid),
      fbclidSessions: num(c.fbclid),
      referralProgrammeSessions: num(c.referral_programme),
      identifiedSessions: num(c.identified),
      bounceRate: pct(num(c.bounces), num(c.closed)),
      avgSessionSeconds: Math.round(num(c.avg_duration)),

      // First-touch cohort — a different population from the rows above. Named
      // so the UI cannot accidentally put them under one heading.
      firstTouchVisitors: firstTouches,
      signups,
      signupRate: pct(signups, firstTouches),
      subscribers,
      subscriberRate: pct(subscribers, signups),
      revenueRupees: round1(revenue),
      mrrRupees: round1(num(o.mrr)),
      /** What one first-touched visitor has been worth so far. */
      revenuePerVisitor: per(revenue, firstTouches),
    },
    deltas: {
      sessions: delta(sessions, num(p.sessions)),
      visitors: delta(num(c.visitors), num(p.visitors)),
      taggedSessions: delta(tagged, num(p.tagged)),
      signups: delta(signups, num(po.signups)),
      subscribers: delta(subscribers, num(po.subscribers)),
      revenueRupees: delta(revenue, num(po.revenue)),
    },
    channels: channels.map((r) => ({
      channel: String(r.channel),
      sessions: num(r.sessions),
      visitors: num(r.visitors),
      identifiedSessions: num(r.identified),
      share: pct(num(r.sessions), channelTotal),
    })),
  };
};

// ── breakdown ───────────────────────────────────────────────────────────────

/**
 * One row per value of the chosen dimension, traffic joined to outcomes.
 *
 * FULL OUTER JOIN, not LEFT: a campaign can legitimately appear on only one
 * side. A campaign that ran last month but converted someone this month has
 * outcomes and no sessions in this window; a campaign that ran today has
 * sessions and no outcomes yet. A LEFT JOIN from traffic would silently drop
 * the first kind — which is exactly the row a "did last month's spend work?"
 * question is looking for.
 */
export const getUtmBreakdownService = async (f: UtmFilters) => {
  const key = (f.dimension ?? "sourceMedium") as UtmDimension;
  const dim = DIMENSIONS[key] ?? DIMENSIONS.sourceMedium;
  const limit = Math.min(Math.max(f.limit ?? 100, 1), 500);

  // The same expression against the first_touch CTE, whose columns carry no
  // table alias. `channel` is already materialised as a column there, so it is
  // substituted rather than re-derived.
  const ftDim =
    key === "channel" ? "ft.channel" : dim.sql.replace(/\bs\./g, "ft.");

  const rows = await q<Record<string, unknown>>(
    `WITH ${attributionCtes(f)},
     traffic AS (
       SELECT ${dim.sql}                                       AS value,
              count(*)                                         AS sessions,
              count(DISTINCT s."visitorId")                    AS visitors,
              count(*) FILTER (WHERE s."userId" IS NOT NULL)   AS identified,
              count(*) FILTER (WHERE s."isBounce")             AS bounces,
              count(*) FILTER (WHERE s."endedAt" IS NOT NULL)  AS closed,
              COALESCE(avg(s."durationSeconds"), 0)            AS avg_duration,
              COALESCE(avg(s."pageViewCount"), 0)              AS avg_pages,
              max(s."startedAt")                               AS last_seen
         FROM native_sessions s
        WHERE ${sessionWhere("s")} ${creatorScope("s")} ${utmWhere(f)}
        GROUP BY 1
     ),
     outcomes AS (
       SELECT ${ftDim}                                         AS value,
              count(*)                                         AS first_touches,
              count(vu."userId")                               AS signups,
              count(*) FILTER (WHERE ls.live > 0)              AS subscribers,
              count(*) FILTER (WHERE ls.paid_subs > 0)         AS paid_subscribers,
              COALESCE(sum(px.collected), 0)                   AS revenue,
              COALESCE(sum(ls.mrr), 0)                         AS mrr
         FROM first_touch ft
         ${VISITOR_USER_JOIN}
        WHERE ${firstTouchWhere(f)}
        GROUP BY 1
     )
     SELECT COALESCE(t.value, o.value)  AS value,
            COALESCE(t.sessions, 0)     AS sessions,
            COALESCE(t.visitors, 0)     AS visitors,
            COALESCE(t.identified, 0)   AS identified,
            COALESCE(t.bounces, 0)      AS bounces,
            COALESCE(t.closed, 0)       AS closed,
            COALESCE(t.avg_duration, 0) AS avg_duration,
            COALESCE(t.avg_pages, 0)    AS avg_pages,
            t.last_seen                 AS last_seen,
            COALESCE(o.first_touches, 0)   AS first_touches,
            COALESCE(o.signups, 0)         AS signups,
            COALESCE(o.subscribers, 0)     AS subscribers,
            COALESCE(o.paid_subscribers, 0) AS paid_subscribers,
            COALESCE(o.revenue, 0)         AS revenue,
            COALESCE(o.mrr, 0)             AS mrr
       FROM traffic t
       FULL OUTER JOIN outcomes o ON o.value = t.value
      ORDER BY COALESCE(o.revenue, 0) DESC,
               COALESCE(t.sessions, 0) DESC
      LIMIT ${limit}`,
    utmBinds(f),
  );

  const shaped = rows.map((r) => {
    const sessions = num(r.sessions);
    const firstTouches = num(r.first_touches);
    const signups = num(r.signups);
    const revenue = num(r.revenue);
    return {
      value: String(r.value ?? "(not set)"),
      // Traffic (sessions started in window)
      sessions,
      visitors: num(r.visitors),
      identifiedSessions: num(r.identified),
      bounceRate: pct(num(r.bounces), num(r.closed)),
      avgSessionSeconds: Math.round(num(r.avg_duration)),
      avgPageViews: round1(num(r.avg_pages)),
      lastSeenAt: r.last_seen ? new Date(r.last_seen as string).toISOString() : null,
      // Outcomes (visitors first touched in window, followed forward)
      firstTouchVisitors: firstTouches,
      signups,
      signupRate: pct(signups, firstTouches),
      subscribers: num(r.subscribers),
      paidSubscribers: num(r.paid_subscribers),
      subscriberRate: pct(num(r.subscribers), signups),
      revenueRupees: round1(revenue),
      mrrRupees: round1(num(r.mrr)),
      /**
       * The column to sort by when deciding where the next rupee goes. Value
       * per visitor the channel delivered — comparable across channels of
       * wildly different volume in a way that total revenue is not.
       */
      revenuePerVisitor: per(revenue, firstTouches),
    };
  });

  const totals = shaped.reduce(
    (acc, r) => ({
      sessions: acc.sessions + r.sessions,
      visitors: acc.visitors + r.visitors,
      signups: acc.signups + r.signups,
      subscribers: acc.subscribers + r.subscribers,
      revenueRupees: acc.revenueRupees + r.revenueRupees,
    }),
    { sessions: 0, visitors: 0, signups: 0, subscribers: 0, revenueRupees: 0 },
  );

  return {
    dimension: key,
    dimensionLabel: dim.label,
    rows: shaped,
    totals: { ...totals, revenueRupees: round1(totals.revenueRupees) },
    /** True when the LIMIT clipped the tail — the UI says so rather than implying completeness. */
    truncated: rows.length === limit,
  };
};

// ── timeseries ──────────────────────────────────────────────────────────────

/**
 * Daily sessions and signups for the top N values of a dimension, plus an
 * "everything else" line.
 *
 * The top N is chosen over the WHOLE window and then held fixed across days —
 * not recomputed per day. A per-day top N produces a chart whose lines change
 * identity halfway along, which looks like a trend and is an artefact.
 */
export const getUtmTimeseriesService = async (f: UtmFilters) => {
  const key = (f.dimension ?? "channel") as UtmDimension;
  const dim = DIMENSIONS[key] ?? DIMENSIONS.channel;
  const topN = Math.min(Math.max(f.limit ?? 6, 1), 12);

  const binds = utmBinds(f);

  const top = await q<Record<string, unknown>>(
    `SELECT ${dim.sql} AS value, count(*) AS sessions
       FROM native_sessions s
      WHERE ${sessionWhere("s")} ${creatorScope("s")} ${utmWhere(f)}
      GROUP BY 1
      ORDER BY sessions DESC
      LIMIT ${topN}`,
    binds,
  );

  const keys = top.map((r) => String(r.value ?? "(not set)"));

  // No traffic at all in the window — return the empty shape rather than send
  // `IN ()` to Postgres, which Sequelize renders as a syntax error.
  if (keys.length === 0) {
    return { dimension: key, dimensionLabel: dim.label, series: [], points: [] };
  }

  const rows = await q<Record<string, unknown>>(
    `SELECT (s."startedAt" AT TIME ZONE 'Asia/Kolkata')::date AS day,
            CASE WHEN ${dim.sql} IN (:topKeys) THEN ${dim.sql} ELSE 'Other' END AS value,
            count(*)                      AS sessions,
            count(DISTINCT s."visitorId") AS visitors,
            count(*) FILTER (WHERE s."userId" IS NOT NULL) AS identified
       FROM native_sessions s
      WHERE ${sessionWhere("s")} ${creatorScope("s")} ${utmWhere(f)}
      GROUP BY 1, 2
      ORDER BY 1`,
    { ...binds, topKeys: keys },
  );

  // Pivot to one object per day with a key per series, which is the shape
  // Recharts wants and which the frontend would otherwise have to build.
  const byDay = new Map<string, Record<string, unknown>>();
  for (const r of rows) {
    const day = String(r.day).slice(0, 10);
    const entry = byDay.get(day) ?? { day };
    entry[String(r.value)] = num(r.sessions);
    entry[`${String(r.value)}__identified`] = num(r.identified);
    byDay.set(day, entry);
  }

  return {
    dimension: key,
    dimensionLabel: dim.label,
    series: keys.concat(rows.some((r) => r.value === "Other") ? ["Other"] : []),
    points: [...byDay.values()].sort((a, b) =>
      String(a.day).localeCompare(String(b.day)),
    ),
  };
};

// ── drill-down ──────────────────────────────────────────────────────────────

/**
 * Everything about one campaign / source / medium selection: which creatives
 * (utm_content / utm_term) ran, where they landed people, who those people
 * were, and the individual sessions.
 *
 * Takes the same utmSource / utmMedium / utmCampaign narrowing as every other
 * endpoint rather than a bespoke id, so a row in the breakdown table links here
 * by just carrying its own filters forward in the URL.
 */
export const getUtmDetailService = async (f: UtmFilters) => {
  const binds = utmBinds(f);
  const where = `${sessionWhere("s")} ${creatorScope("s")} ${utmWhere(f)}`;

  const group = async (expression: string, limit = 25) =>
    q<Record<string, unknown>>(
      `SELECT ${expression} AS value,
              count(*)                                        AS sessions,
              count(DISTINCT s."visitorId")                   AS visitors,
              count(*) FILTER (WHERE s."userId" IS NOT NULL)  AS identified,
              count(*) FILTER (WHERE s."isBounce")            AS bounces,
              count(*) FILTER (WHERE s."endedAt" IS NOT NULL) AS closed
         FROM native_sessions s
        WHERE ${where}
        GROUP BY 1
        ORDER BY sessions DESC
        LIMIT ${limit}`,
      binds,
    );

  const [content, term, landing, country, city, device, browser, referrer, recent] =
    await Promise.all([
      group(`COALESCE(s."utmContent", '(not set)')`),
      group(`COALESCE(s."utmTerm", '(not set)')`),
      group(`COALESCE(s."landingPath", '(unknown)')`, 50),
      group(`COALESCE(s.country, 'Unknown')`),
      group(`COALESCE(s.city, 'Unknown') || ', ' || COALESCE(s."countryCode", '??')`),
      group(`COALESCE(s."deviceType", 'unknown')`),
      group(`COALESCE(s.browser, 'Unknown')`),
      group(`COALESCE(s."referrerDomain", '(direct)')`),

      // A sample of the actual sessions, so a suspicious row can be inspected
      // rather than argued about. Capped hard — this is a spot check, and the
      // session explorer already exists for a real search.
      q<Record<string, unknown>>(
        `SELECT s.id, s."visitorId", s."userId", s."startedAt", s."durationSeconds",
                s."pageViewCount", s."landingPath", s."utmSource", s."utmMedium",
                s."utmCampaign", s."utmContent", s."utmTerm", s.gclid, s.fbclid,
                s.country, s.city, s."deviceType", s.browser, s."isBounce"
           FROM native_sessions s
          WHERE ${where}
          ORDER BY s."startedAt" DESC
          LIMIT 50`,
        binds,
      ),
    ]);

  const shape = (rows: Record<string, unknown>[]) =>
    rows.map((r) => ({
      value: String(r.value ?? "(not set)"),
      sessions: num(r.sessions),
      visitors: num(r.visitors),
      identifiedSessions: num(r.identified),
      identifiedShare: pct(num(r.identified), num(r.sessions)),
      bounceRate: pct(num(r.bounces), num(r.closed)),
    }));

  return {
    selection: {
      utmSource: f.utmSource ?? null,
      utmMedium: f.utmMedium ?? null,
      utmCampaign: f.utmCampaign ?? null,
    },
    content: shape(content),
    terms: shape(term),
    landingPages: shape(landing),
    countries: shape(country),
    cities: shape(city),
    devices: shape(device),
    browsers: shape(browser),
    referrers: shape(referrer),
    recentSessions: recent.map((r) => ({
      id: String(r.id),
      visitorId: String(r.visitorId),
      userId: r.userId === null ? null : String(r.userId),
      startedAt: new Date(r.startedAt as string).toISOString(),
      durationSeconds: r.durationSeconds === null ? null : num(r.durationSeconds),
      pageViewCount: num(r.pageViewCount),
      landingPath: r.landingPath === null ? null : String(r.landingPath),
      utmSource: r.utmSource === null ? null : String(r.utmSource),
      utmMedium: r.utmMedium === null ? null : String(r.utmMedium),
      utmCampaign: r.utmCampaign === null ? null : String(r.utmCampaign),
      utmContent: r.utmContent === null ? null : String(r.utmContent),
      utmTerm: r.utmTerm === null ? null : String(r.utmTerm),
      gclid: r.gclid === null ? null : String(r.gclid),
      fbclid: r.fbclid === null ? null : String(r.fbclid),
      country: r.country === null ? null : String(r.country),
      city: r.city === null ? null : String(r.city),
      deviceType: r.deviceType === null ? null : String(r.deviceType),
      browser: r.browser === null ? null : String(r.browser),
      isBounce: r.isBounce === null ? null : Boolean(r.isBounce),
    })),
  };
};

// ── tagging hygiene ─────────────────────────────────────────────────────────

/**
 * What is WRONG with the tagging, as a worklist.
 *
 * This view exists because every other number on the dashboard is downstream of
 * it. `Google` and `google` are two rows in every group-by, which splits one
 * campaign's budget across two lines and makes both look half as effective as
 * they are. An ad click that arrives with a gclid and no utm_source is filed by
 * CHANNEL_SQL correctly, but appears as "(not set)" in every source table.
 *
 * Each finding names the fix, not just the fault: these are things to change in
 * the link builder and in the ad platform, and a list of symptoms with no
 * instruction attached tends to be read once and never acted on.
 */
export const getUtmHygieneService = async (f: UtmFilters) => {
  const binds = utmBinds(f);
  const where = `${sessionWhere("s")} ${creatorScope("s")} ${utmWhere(f)}`;

  const [issues, caseVariants, mediumValues] = await Promise.all([
    q<Record<string, unknown>>(
      `SELECT
         count(*) FILTER (WHERE s.gclid IS NOT NULL AND s."utmSource" IS NULL)
           AS gclid_untagged,
         count(*) FILTER (WHERE s.fbclid IS NOT NULL AND s."utmSource" IS NULL)
           AS fbclid_untagged,
         count(*) FILTER (WHERE s."utmSource" IS NOT NULL AND s."utmMedium" IS NULL)
           AS source_without_medium,
         count(*) FILTER (WHERE s."utmCampaign" IS NOT NULL AND s."utmSource" IS NULL)
           AS campaign_without_source,
         count(*) FILTER (WHERE s."utmSource" IS NOT NULL AND s."utmSource" <> lower(s."utmSource"))
           AS uppercase_source,
         count(*) FILTER (WHERE s."utmMedium" IS NOT NULL AND s."utmMedium" <> lower(s."utmMedium"))
           AS uppercase_medium,
         count(*) FILTER (WHERE s."utmSource" ~ '\\s' OR s."utmCampaign" ~ '\\s' OR s."utmMedium" ~ '\\s')
           AS whitespace_in_params,
         count(*) FILTER (WHERE s."utmSource" ~* '^(hoopr\\.ai|www\\.hoopr\\.ai|creator\\.hoopr\\.ai)$')
           AS self_referral,
         count(*) FILTER (WHERE s."referrerDomain" ~* '(facebook|instagram|youtube|linkedin|twitter)'
                            AND s."utmSource" IS NULL AND s.fbclid IS NULL)
           AS untagged_social,
         count(*)                                                    AS sessions
       FROM native_sessions s
      WHERE ${where}`,
      binds,
    ),

    // Values that differ only by case or by -/_ — i.e. the same campaign
    // showing up as several rows. Grouped on the normalised form, reported only
    // where more than one raw spelling collapsed into it.
    q<Record<string, unknown>>(
      `SELECT field, normalised, count(DISTINCT raw) AS variants,
              string_agg(DISTINCT raw, ' · ' ORDER BY raw) AS spellings,
              sum(sessions) AS sessions
         FROM (
           SELECT 'utm_source' AS field, s."utmSource" AS raw,
                  lower(replace(s."utmSource", '-', '_')) AS normalised,
                  count(*) AS sessions
             FROM native_sessions s WHERE ${where} AND s."utmSource" IS NOT NULL
            GROUP BY 1, 2, 3
           UNION ALL
           SELECT 'utm_medium', s."utmMedium",
                  lower(replace(s."utmMedium", '-', '_')), count(*)
             FROM native_sessions s WHERE ${where} AND s."utmMedium" IS NOT NULL
            GROUP BY 1, 2, 3
           UNION ALL
           SELECT 'utm_campaign', s."utmCampaign",
                  lower(replace(s."utmCampaign", '-', '_')), count(*)
             FROM native_sessions s WHERE ${where} AND s."utmCampaign" IS NOT NULL
            GROUP BY 1, 2, 3
         ) v
        GROUP BY field, normalised
       HAVING count(DISTINCT raw) > 1
        ORDER BY sessions DESC
        LIMIT 50`,
      binds,
    ),

    // Every distinct utm_medium in use, so someone can see at a glance that the
    // vocabulary has drifted (cpc / paid_search / Paid_Search / sem all mean
    // the same thing).
    q<Record<string, unknown>>(
      `SELECT COALESCE(s."utmMedium", '(not set)') AS value, count(*) AS sessions
         FROM native_sessions s
        WHERE ${where} AND s."utmMedium" IS NOT NULL
        GROUP BY 1
        ORDER BY sessions DESC
        LIMIT 60`,
      binds,
    ),
  ]);

  const i = issues[0] ?? {};
  const sessions = num(i.sessions);

  /** One finding, with the count that makes it worth acting on and the fix. */
  const finding = (
    id: string,
    title: string,
    count: number,
    severity: "high" | "medium" | "low",
    detail: string,
    fix: string,
  ) => ({ id, title, sessions: count, share: pct(count, sessions), severity, detail, fix });

  const findings = [
    finding(
      "gclid-untagged",
      "Google Ads clicks with no utm_source",
      num(i.gclid_untagged),
      "high",
      "These sessions carry a gclid, so they are definitely paid Google traffic, but no UTM parameters. They are correctly counted as Paid search here — but they appear as “(not set)” in every source, medium and campaign table, so the spend cannot be attributed to a specific campaign.",
      "Either turn on auto-tagging → UTM in the Google Ads campaign settings, or add utm_source=google&utm_medium=cpc&utm_campaign={campaignid} to the final URL suffix.",
    ),
    finding(
      "fbclid-untagged",
      "Meta clicks with no utm_source",
      num(i.fbclid_untagged),
      "high",
      "Sessions with an fbclid but no UTM parameters — paid or boosted Meta traffic that cannot be tied to an ad set.",
      "Set the URL parameters field on the Meta ad to utm_source=meta&utm_medium=paid_social&utm_campaign={{campaign.name}}&utm_content={{ad.name}}.",
    ),
    finding(
      "source-without-medium",
      "utm_source set without utm_medium",
      num(i.source_without_medium),
      "medium",
      "A source with no medium cannot be classified into a channel by rule, so it lands in “Other campaign” and never joins the paid or organic totals.",
      "Make utm_medium mandatory in the UTM Builder — it is the field the channel grouping keys on.",
    ),
    finding(
      "campaign-without-source",
      "utm_campaign set without utm_source",
      num(i.campaign_without_source),
      "medium",
      "The campaign is named but its origin is not, so the row shows up in campaign reports and is missing from every source report.",
      "Never publish a link with utm_campaign alone. Source and medium are the two that must always travel together.",
    ),
    finding(
      "casing",
      "Mixed capitalisation in UTM values",
      num(i.uppercase_source) + num(i.uppercase_medium),
      "high",
      "“Google” and “google” are different strings and therefore different rows, which splits one campaign’s traffic — and its conversions — across two lines that each look half as good as the campaign really is.",
      "Lower-case every value at the point the link is built, and fix the existing links in the ad platforms. The Campaign hygiene table below lists which values have collided.",
    ),
    finding(
      "whitespace",
      "Spaces inside UTM values",
      num(i.whitespace_in_params),
      "medium",
      "A space survives URL-encoding as %20 or + and often gets truncated or double-encoded on the way through a link shortener, producing values that do not match anything.",
      "Use underscores. Reject spaces in the UTM Builder.",
    ),
    finding(
      "self-referral",
      "UTMs pointing at our own domain",
      num(i.self_referral),
      "low",
      "A utm_source of hoopr.ai means an internal link was tagged as if it were an external campaign, which inflates acquisition with traffic that was already ours.",
      "Use utm_source=website with a specific utm_medium for internal placements, so they can be excluded from acquisition totals.",
    ),
    finding(
      "untagged-social",
      "Social referrals with no campaign tagging",
      num(i.untagged_social),
      "medium",
      "Traffic arriving from a social platform with no UTM and no click id — organic posts, bios and shared links that nobody tagged. It is counted as Organic social, but which post drove it is unknowable.",
      "Tag every link posted from a brand account, including link-in-bio destinations. This is the cheapest attribution win available.",
    ),
  ]
    .filter((x) => x.sessions > 0)
    .sort((a, b) => b.sessions - a.sessions);

  return {
    sessions,
    findings,
    /** Values that collapse to the same thing once case and -/_ are normalised. */
    collisions: caseVariants.map((r) => ({
      field: String(r.field),
      normalised: String(r.normalised),
      variantCount: num(r.variants),
      spellings: String(r.spellings ?? "").split(" · "),
      sessions: num(r.sessions),
    })),
    /** The full utm_medium vocabulary in use, for spotting drift. */
    mediumVocabulary: mediumValues.map((r) => ({
      value: String(r.value),
      sessions: num(r.sessions),
    })),
  };
};

/**
 * Distinct values actually present, for the drill-down dropdowns.
 *
 * Read from the data rather than from a constant, for the same reason
 * `getFilterOptionsService` does: offering a campaign that will return nothing
 * is a dead end for whoever clicks it.
 */
export const getUtmValuesService = async (f: UtmFilters) => {
  const binds = utmBinds(f);

  const distinct = async (column: string) =>
    q<Record<string, unknown>>(
      `SELECT s."${column}" AS value, count(*) AS sessions
         FROM native_sessions s
        WHERE ${sessionWhere("s")} ${creatorScope("s")}
          AND s."${column}" IS NOT NULL
        GROUP BY 1
        ORDER BY sessions DESC
        LIMIT 200`,
      binds,
    );

  const [sources, mediums, campaigns] = await Promise.all([
    distinct("utmSource"),
    distinct("utmMedium"),
    distinct("utmCampaign"),
  ]);

  const pick = (rows: Record<string, unknown>[]) =>
    rows.map((r) => ({ value: String(r.value), sessions: num(r.sessions) }));

  return {
    sources: pick(sources),
    mediums: pick(mediums),
    campaigns: pick(campaigns),
  };
};
