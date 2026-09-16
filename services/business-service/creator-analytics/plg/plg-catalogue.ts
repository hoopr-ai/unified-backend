// ─── PLG growth analytics — the catalogue ────────────────────────────────────
//
// Every number the Growth views print is built from the ACTIONS below, grouped
// into the STAGES and SUB_FUNNELS below. Nothing else defines a metric. To add
// an event, a stage, a funnel or a segment, add an entry here — the SQL, the
// API, the metric dictionary and the data-audit page all read this file.
//
// ── WHAT AN ACTION IS ───────────────────────────────────────────────────────
//
// One kind of thing a person did, as a set of rows `(pk, uid, at, d)`:
//
//   pk   the PERSON key (see IDENTITY below)
//   uid  users.id when the person is known, else NULL
//   at   when it happened
//   d    one detail worth grouping by (a plan, a query, an entry source …)
//
// Each action reads ONE existing source. No new tracking is introduced here:
// the audit that preceded this module (2026-09-16) found that the product
// tables and the request log already carry most of the lifecycle back to the
// web launch, and that the client event stream only covers it from 15-16 Sep.
// Where both exist, both are read and unioned, so history is not lost and the
// richer event is used where it exists.
//
// ── IDENTITY ────────────────────────────────────────────────────────────────
//
// A person is `u<users.id>` once they are known, else `v<visitorId>` (the
// durable hoopr_vid cookie). Anonymous web activity is credited to the account
// that browser FIRST signed into (`plg_v2u`), so the searches and plays before a
// signup belong to the person who signed up — 92% of web signups have such
// pre-signup activity on the same browser (measured 2026-09-16).
//
// Known limits, stated rather than hidden:
//   · A browser shared by two accounts (223 of 5,158 signed-in browsers)
//     credits its anonymous activity to the first of them.
//   · One person on two devices is one person only once they sign in on both;
//     before that they are two visitors (415 users have >1 browser).
//   · Server request rows are keyed by user id only. Before 2026-09-16 the
//     interceptor minted a fresh visitor per call, so their visitor ids mean
//     nothing; a signed-in request always carries the user.
//   · The creator APP emits no events at all. App people are known only by
//     user id, from their logins, searches, projects, downloads and money.

export type Surface = "web" | "app" | "any";

export type ActionCategory =
  | "traffic"
  | "activation"
  | "browse"
  | "signup"
  | "intent"
  | "subscription"
  | "value"
  | "retention"
  | "journey";

export interface ActionSpec {
  key: string;
  label: string;
  category: ActionCategory;
  /** Where the person was when they did it. `any` = a table both clients write. */
  surface: Surface;
  /** What it means, in product language. */
  definition: string;
  /** The table / event behind it, for the dictionary. */
  source: string;
  /** How a row is tied to a person. */
  identity: string;
  /** First IST day this source can answer. A window before it reads as "no data", never as zero. */
  coverageFrom: string;
  /** What to keep in mind before quoting it. */
  caveat?: string;
  /**
   * A SELECT producing `pk, uid, at, d`, bounded by the binds :actFrom and
   * :actTo (timestamptz). May reference the `plg_v2u` CTE.
   */
  sql: string;
}

// ── SQL building blocks ─────────────────────────────────────────────────────

/** The person behind a web row: its user, else the user its browser became, else the browser. */
const WEB_UID = (a: string) => `COALESCE(${a}."userId", m.uid)`;
const WEB_PK = (a: string) =>
  `CASE WHEN ${WEB_UID(a)} IS NOT NULL THEN 'u' || ${WEB_UID(a)} ELSE 'v' || ${a}."visitorId" END`;

const IN_WINDOW = (col: string) => `${col} >= :actFrom AND ${col} < :actTo`;

const list = (xs: readonly string[]) => xs.map((x) => `'${x}'`).join(", ");

/**
 * A creator-web client event. `source = 'CLIENT'` is mandatory: server rows
 * with these names do not exist, and server rows in general carried phantom
 * visitors until 2026-09-16.
 */
const clientEvent = (names: readonly string[], detail: string, extra = ""): string => `
    SELECT ${WEB_PK("e")} AS pk, ${WEB_UID("e")} AS uid, e."occurredAt" AS at, ${detail} AS d
      FROM native_events e
      LEFT JOIN plg_v2u m ON m.vid = e."visitorId"
     WHERE e."eventName" IN (${list(names)})
       AND e.source = 'CLIENT' AND NOT e."isBot"
       AND ${IN_WINDOW(`e."occurredAt"`)}
       ${extra}`;

/**
 * A NATIVE-BE request, from the interceptor's log. 4xx rows are written as
 * API_ERROR and successes as API_CALL — never both for one request (checked).
 */
const apiRequest = (method: string, endpoints: readonly string[], status: string, detail: string): string => `
    SELECT 'u' || e."userId" AS pk, e."userId" AS uid, e."occurredAt" AS at, ${detail} AS d
      FROM native_events e
     WHERE e."eventName" IN ('API_CALL', 'API_ERROR')
       AND ${IN_WINDOW(`e."occurredAt"`)}
       AND e."userId" IS NOT NULL
       AND e.method = '${method}'
       AND (${endpoints.map((p) => `e.endpoint LIKE '${p}'`).join(" OR ")})
       AND ${status}`;

/** Restricts a user-keyed table to creator accounts. */
const CREATOR = (uidCol: string) =>
  `EXISTS (SELECT 1 FROM users cu WHERE cu.id = ${uidCol} AND cu.platform = 'CREATOR')`;

/** A login from the Android or iOS app, recognised by the app's own User-Agent. */
export const APP_UA = `"userAgent" ~* 'cfnetwork|okhttp|dalvik'`;

/** A real browser session — the same predicate as every traffic figure in this CMS. */
export const REAL_SESSION = (s: string) => `NOT ${s}."isBot"
       AND ${s}.os IS NOT NULL
       AND COALESCE(${s}.browser, '') NOT ILIKE '%headless%'`;

// ── The actions ─────────────────────────────────────────────────────────────

export const ACTIONS: readonly ActionSpec[] = [
  // ── Traffic ──
  {
    key: "visit_web",
    label: "Visited the website",
    category: "traffic",
    surface: "web",
    definition:
      "A day with at least one real browser session on Creator Web — one row per person, day and " +
      "signed-in state. `d` says whether it was signed in.",
    source: "native_sessions (real clients: parsed OS, not a bot, not headless)",
    identity: "Session user, else the account the browser first signed into, else the browser",
    coverageFrom: "2026-08-17",
    caveat:
      "Proxy rows with no User-Agent (80% of all session rows) are excluded — they are not people.",
    // One row per person, IST day and signed-in state — the first session of
    // each. Every consumer needs "was here that day, and how"; the raw rows are
    // ~9 per visitor per day and made this the slowest part of every query.
    sql: `
    SELECT ${WEB_PK("s")} AS pk, max(${WEB_UID("s")}) AS uid, min(s."startedAt") AS at,
           CASE WHEN s."userId" IS NOT NULL THEN 'signed_in' ELSE 'signed_out' END AS d
      FROM native_sessions s
      LEFT JOIN plg_v2u m ON m.vid = s."visitorId"
     WHERE ${IN_WINDOW(`s."startedAt"`)}
       AND ${REAL_SESSION("s")}
     GROUP BY 1, 4, (s."startedAt" AT TIME ZONE 'Asia/Kolkata')::date`,
  },
  {
    key: "app_open",
    label: "Used the app",
    category: "traffic",
    surface: "app",
    definition:
      "An app login, or the last recorded activity of an app session, inside the window. `d` is login | active.",
    source: "user_sessions (content-recommendation), app User-Agent only",
    identity: "users.id",
    coverageFrom: "2026-08-17",
    caveat:
      "The app sends no events. A session stores only its LAST activity, so a person active " +
      "early in a long window and again after it is missed — app traffic is a lower bound.",
    sql: `
    SELECT 'u' || us."userId" AS pk, us."userId" AS uid, us."createdAt" AS at, 'login' AS d
      FROM user_sessions us
     WHERE ${IN_WINDOW(`us."createdAt"`)} AND us.${APP_UA} AND us."userId" IS NOT NULL
    UNION ALL
    SELECT 'u' || us."userId", us."userId", us."lastActivityAt", 'active'
      FROM user_sessions us
     WHERE ${IN_WINDOW(`us."lastActivityAt"`)} AND us.${APP_UA} AND us."userId" IS NOT NULL
       AND us."lastActivityAt" > us."createdAt" + interval '1 minute'`,
  },
  {
    key: "page_view",
    label: "Viewed a page",
    category: "journey",
    surface: "web",
    definition: "A page view on Creator Web. Used for journeys only — never a funnel rung.",
    source: "native_events PAGE_VIEW (client)",
    identity: "As visit_web",
    coverageFrom: "2026-08-17",
    sql: clientEvent(["PAGE_VIEW"], `split_part(e.path, '?', 1)`),
  },

  // ── Activation ──
  {
    key: "search_web",
    label: "Searched (web)",
    category: "activation",
    surface: "web",
    definition: "A search on Creator Web, signed in or not. `d` is the query.",
    source: "native_events SEARCH (client)",
    identity: "As visit_web",
    coverageFrom: "2026-09-15",
    sql: clientEvent(["SEARCH"], `lower(btrim(e.properties->>'query'))`),
  },
  {
    key: "search_app",
    label: "Searched (signed in, any surface)",
    category: "activation",
    surface: "any",
    definition:
      "A search served by the search service to a signed-in creator, where the web did not " +
      "already report the same search. `d` is the query.",
    source: "rec_events surface=aienterpriseSearch, one per user/query/minute",
    identity: "users.id",
    coverageFrom: "2026-08-17",
    caveat:
      "Signed-in only — anonymous searches are logged with no user. A web search that the " +
      "client also reported (within 2 minutes) is dropped here so it is not counted twice.",
    sql: `
    SELECT DISTINCT ON (r.user_id, lower(btrim(r.query)), date_trunc('minute', r.created_at))
           'u' || r.user_id AS pk, r.user_id AS uid, r.created_at AS at, lower(btrim(r.query)) AS d
      FROM rec_events r
     WHERE r.surface = 'aienterpriseSearch'
       AND r.user_id IS NOT NULL AND r.brand_id IS NULL
       AND ${IN_WINDOW("r.created_at")}
       AND ${CREATOR("r.user_id")}
       AND NOT EXISTS (
             SELECT 1 FROM native_events w
              WHERE w."userId" = r.user_id AND w."eventName" = 'SEARCH' AND w.source = 'CLIENT'
                AND w."occurredAt" BETWEEN r.created_at - interval '2 minutes' AND r.created_at + interval '2 minutes')
     ORDER BY r.user_id, lower(btrim(r.query)), date_trunc('minute', r.created_at), r.created_at`,
  },
  {
    key: "search_zero",
    label: "Search found nothing",
    category: "browse",
    surface: "web",
    definition: "A web search that returned zero results. `d` is the query.",
    source: "native_events SEARCH where zeroResults = true",
    identity: "As visit_web",
    coverageFrom: "2026-09-15",
    sql: clientEvent(
      ["SEARCH"],
      `lower(btrim(e.properties->>'query'))`,
      `AND e.properties->>'zeroResults' = 'true'`,
    ),
  },
  {
    key: "stream",
    label: "Played a track",
    category: "activation",
    surface: "web",
    definition: "A new track started playing on Creator Web (resumes are not counted). `d` is the track code.",
    source: "native_events TRACK_PLAY (client)",
    identity: "As visit_web",
    coverageFrom: "2026-09-15",
    caveat: "Web only: the app records no plays anywhere. Listening time is not captured.",
    sql: clientEvent(["TRACK_PLAY"], `e.properties->>'trackCode'`),
  },
  {
    key: "stream_complete",
    label: "Heard a track to the end",
    category: "browse",
    surface: "web",
    definition: "A track played through to its end. `d` is the track code.",
    source: "native_events TRACK_COMPLETE (client)",
    identity: "As visit_web",
    coverageFrom: "2026-09-15",
    sql: clientEvent(["TRACK_COMPLETE"], `e.properties->>'trackCode'`),
  },
  {
    key: "save",
    label: "Saved music",
    category: "activation",
    surface: "any",
    definition: "Favourited a track or created a collection. `d` is like | collection.",
    source: "user_liked_tracks, collections",
    identity: "users.id",
    coverageFrom: "2026-08-17",
    sql: `
    SELECT 'u' || l."userId" AS pk, l."userId" AS uid, l."createdAt" AS at, 'like' AS d
      FROM user_liked_tracks l
     WHERE ${IN_WINDOW(`l."createdAt"`)} AND ${CREATOR(`l."userId"`)}
    UNION ALL
    SELECT 'u' || c."userId", c."userId", c."createdAt" AT TIME ZONE 'UTC', 'collection'
      FROM collections c
     WHERE c."createdAt" AT TIME ZONE 'UTC' >= :actFrom AND c."createdAt" AT TIME ZONE 'UTC' < :actTo`,
  },
  {
    key: "project",
    label: "Created a project",
    category: "activation",
    surface: "app",
    definition: "Started a sound project in the app (the video-scoring flow).",
    source: "sound_projects where platform = app",
    identity: "users.id",
    coverageFrom: "2026-08-17",
    sql: `
    SELECT 'u' || p."userId" AS pk, p."userId" AS uid, p."createdAt" AS at, p.status AS d
      FROM sound_projects p
     WHERE p.platform = 'app' AND ${IN_WINDOW(`p."createdAt"`)}`,
  },
  {
    key: "download",
    label: "Downloaded",
    category: "value",
    surface: "any",
    definition: "A licence was issued — a track, stem, mix or free SFX actually downloaded. `d` is the asset type.",
    source: "licenses (creator rows: no brand)",
    identity: "users.id",
    coverageFrom: "2026-08-17",
    caveat: "Licences carry no platform, so downloads are not split by web and app.",
    sql: `
    SELECT 'u' || x."userId" AS pk, x."userId" AS uid, x."licensedAt" AS at, COALESCE(x.type, 'track') AS d
      FROM licenses x
     WHERE x."brandId" IS NULL AND x."userId" IS NOT NULL
       AND ${IN_WINDOW(`x."licensedAt"`)}`,
  },

  // ── Browsing (sub-funnel material, not activation) ──
  {
    key: "browse",
    label: "Browsed",
    category: "browse",
    surface: "web",
    definition: "Opened a playlist, clicked a rail item or applied a filter. `d` is which.",
    source: "native_events PLAYLIST_OPEN / RAIL_ITEM_CLICK / FILTER_APPLIED (client)",
    identity: "As visit_web",
    coverageFrom: "2026-09-16",
    sql: clientEvent(["PLAYLIST_OPEN", "RAIL_ITEM_CLICK", "FILTER_APPLIED"], `e."eventName"`),
  },

  // ── Sign-up ──
  {
    key: "free_plays_out",
    label: "Ran out of free plays",
    category: "signup",
    surface: "web",
    definition: "A signed-out visitor used all free plays and was asked to sign in.",
    source: "native_events PLAY_GATE_SHOWN reason=free_plays_exhausted",
    identity: "As visit_web",
    coverageFrom: "2026-09-15",
    sql: clientEvent(
      ["PLAY_GATE_SHOWN"],
      `e.properties->>'reason'`,
      `AND e.properties->>'reason' = 'free_plays_exhausted'`,
    ),
  },
  {
    key: "auth_prompt",
    label: "Opened sign-in",
    category: "signup",
    surface: "web",
    definition: "The sign-in / sign-up overlay opened. `d` is header | gated_action.",
    source: "native_events LOGIN_STARTED (client)",
    identity: "As visit_web",
    coverageFrom: "2026-09-16",
    sql: clientEvent(["LOGIN_STARTED"], `e.properties->>'surface'`),
  },
  {
    key: "otp_requested",
    label: "Requested a code",
    category: "signup",
    surface: "web",
    definition: "Asked for an OTP. `d` is phone | email.",
    source: "native_events OTP_REQUESTED (client)",
    identity: "As visit_web",
    coverageFrom: "2026-09-16",
    sql: clientEvent(["OTP_REQUESTED"], `e.properties->>'channel'`),
  },
  {
    key: "otp_verified",
    label: "Verified the code",
    category: "signup",
    surface: "web",
    definition: "Passed the OTP. From here an account exists.",
    source: "native_events OTP_VERIFIED (client)",
    identity: "As visit_web",
    coverageFrom: "2026-09-16",
    sql: clientEvent(["OTP_VERIFIED"], `e.properties->>'channel'`),
  },
  {
    key: "new_account_web",
    label: "Started onboarding",
    category: "signup",
    surface: "web",
    definition: "Verified as a NEW account and entered the profile steps (returning users log in instead).",
    source: "native_events SIGNUP_STARTED (client)",
    identity: "As visit_web",
    coverageFrom: "2026-09-16",
    sql: clientEvent(["SIGNUP_STARTED"], `e.properties->>'signup_method'`),
  },
  {
    key: "login",
    label: "Logged in",
    category: "signup",
    surface: "web",
    definition: "A returning account signed in on the web.",
    source: "native_events LOGIN_COMPLETED (client)",
    identity: "As visit_web",
    coverageFrom: "2026-09-16",
    sql: clientEvent(["LOGIN_COMPLETED"], `NULL::text`),
  },
  {
    key: "account_created",
    label: "Signed up",
    category: "signup",
    surface: "any",
    definition:
      "A creator account came into existence: users.createdAt, or onboardedAt for legacy " +
      "consumer rows claimed on the web (which keep a NULL createdAt).",
    source: "users (platform = CREATOR)",
    identity: "users.id",
    coverageFrom: "2026-08-17",
    caveat:
      "NATIVE-BE left createdAt NULL until 2026-09-16; those rows were backfilled from their own " +
      "timestamps (users_created_at_backfill). 19 accounts with no reliable date are excluded.",
    sql: `
    SELECT 'u' || u.id AS pk, u.id AS uid, COALESCE(u."createdAt", u."onboardedAt") AS at, NULL::text AS d
      FROM users u
     WHERE u.platform = 'CREATOR'
       AND ${IN_WINDOW(`COALESCE(u."createdAt", u."onboardedAt")`)}`,
  },
  {
    key: "onboarded",
    label: "Completed onboarding",
    category: "signup",
    surface: "any",
    definition: "Finished the profile steps (users.onboardedAt). `d` is the web signup method where known.",
    source: "users.onboardedAt",
    identity: "users.id",
    coverageFrom: "2026-08-17",
    sql: `
    SELECT 'u' || u.id AS pk, u.id AS uid, u."onboardedAt" AS at, NULL::text AS d
      FROM users u
     WHERE u.platform = 'CREATOR' AND ${IN_WINDOW(`u."onboardedAt"`)}`,
  },

  // ── Conversion intent ──
  {
    key: "pricing_view",
    label: "Viewed pricing",
    category: "intent",
    surface: "web",
    definition: "Opened the pricing page (any route there, including campaign links).",
    source: "native_events PAGE_VIEW path=/pricing (client)",
    identity: "As visit_web",
    coverageFrom: "2026-08-17",
    sql: clientEvent(
      ["PAGE_VIEW"],
      `NULL::text`,
      `AND (e.path = '/pricing' OR e.path LIKE '/pricing?%')`,
    ),
  },
  {
    key: "pricing_entry",
    label: "Reached pricing from…",
    category: "intent",
    surface: "web",
    definition:
      "The pricing arrival WITH the action that sent the visitor there. `d` is the entry source " +
      "(download_paywall, header_cta, masthead, direct …).",
    source: "native_events PRICING_VIEWED (client)",
    identity: "As visit_web",
    coverageFrom: "2026-09-16",
    sql: clientEvent(["PRICING_VIEWED"], `e.properties->>'entry_source'`),
  },
  {
    key: "paywall_download",
    label: "Download blocked by paywall",
    category: "intent",
    surface: "web",
    definition: "Asked to download without a plan and was refused.",
    source: "NATIVE-BE POST /downloads/license → 402 (request log)",
    identity: "users.id (the request was signed in)",
    coverageFrom: "2026-08-17",
    sql: apiRequest("POST", ["/downloads/license"], `e."statusCode" = 402`, `'track'`),
  },
  {
    key: "download_attempt",
    label: "Tried to download",
    category: "browse",
    surface: "web",
    definition: "Pressed download while signed in, whatever the outcome. `d` is ok | paywall | error.",
    source: "NATIVE-BE POST /downloads/license (request log)",
    identity: "users.id",
    coverageFrom: "2026-08-17",
    sql: apiRequest(
      "POST",
      ["/downloads/license"],
      "TRUE",
      `CASE WHEN e."statusCode" < 300 THEN 'ok' WHEN e."statusCode" = 402 THEN 'paywall' ELSE 'error' END`,
    ),
  },
  {
    key: "locked_feature",
    label: "Tried a paid feature",
    category: "intent",
    surface: "web",
    definition: "Tried stems or the mixer without a plan. `d` is stems | mixer.",
    source: "NATIVE-BE POST /stems/download, /mixer/mix → 402 (request log)",
    identity: "users.id",
    coverageFrom: "2026-08-17",
    sql: apiRequest(
      "POST",
      ["/stems/download%", "/mixer/mix%"],
      `e."statusCode" = 402`,
      `CASE WHEN e.endpoint LIKE '/stems/%' THEN 'stems' ELSE 'mixer' END`,
    ),
  },
  {
    key: "checkout",
    label: "Started checkout",
    category: "intent",
    surface: "any",
    definition:
      "Pressed Subscribe and a checkout was opened. `d` is the plan code where known.",
    source:
      "native_events CHECKOUT_STARTED (client, from 2026-08-28) ∪ POST /subscription/checkout " +
      "(request log) ∪ user_subscriptions rows (every checkout creates one, paid or not)",
    identity: "As visit_web for the event; users.id otherwise",
    coverageFrom: "2026-08-17",
    caveat:
      "Apple in-app purchases create no row until they succeed, so app checkout abandonment is invisible.",
    sql: `${clientEvent(["CHECKOUT_STARTED"], `e.properties->>'plan_code'`)}
    UNION ALL
    ${apiRequest("POST", ["/subscription/checkout%"], `e."statusCode" < 500`, `NULL::text`)}
    UNION ALL
    SELECT 'u' || us."userId" AS pk, us."userId" AS uid, us."createdAt" AS at, us."planCode" AS d
      FROM user_subscriptions us
     WHERE us."legacyPlanId" IS NULL AND ${IN_WINDOW(`us."createdAt"`)}`,
  },
  {
    key: "payment_failed",
    label: "Payment failed",
    category: "intent",
    surface: "web",
    definition: "The payment provider declined or the payment was abandoned on its page.",
    source: "native_events PAYMENT_FAILED (client)",
    identity: "As visit_web",
    coverageFrom: "2026-09-16",
    sql: clientEvent(["PAYMENT_FAILED"], `e.properties->>'reason'`),
  },
  {
    key: "checkout_abandoned",
    label: "Checkout abandoned",
    category: "intent",
    surface: "any",
    definition: "A subscription row that never activated (no billing period ever started). `d` is the plan.",
    source: "user_subscriptions where currentPeriodStart IS NULL",
    identity: "users.id",
    coverageFrom: "2026-08-17",
    caveat:
      "65% of subscription rows since launch are these — the existing Funnel view's " +
      "'Subscriptions started' counts them as subscriptions.",
    sql: `
    SELECT 'u' || us."userId" AS pk, us."userId" AS uid, us."createdAt" AS at, us."planCode" AS d
      FROM user_subscriptions us
     WHERE us."currentPeriodStart" IS NULL AND us.status <> 'pending'
       AND us."legacyPlanId" IS NULL AND ${IN_WINDOW(`us."createdAt"`)}`,
  },

  // ── Subscription ──
  {
    key: "subscribed",
    label: "Subscribed",
    category: "subscription",
    surface: "any",
    definition:
      "A subscription that ACTIVATED (a billing period started) — paid, Apple or granted. " +
      "Timed at checkout creation, because currentPeriodStart moves on every renewal. `d` is the plan.",
    source: "user_subscriptions where currentPeriodStart IS NOT NULL, not migrated from legacy",
    identity: "users.id",
    coverageFrom: "2026-08-17",
    caveat: "Granted (manual) plans are included; the plan and provider breakdown separates them.",
    sql: `
    SELECT 'u' || us."userId" AS pk, us."userId" AS uid, us."createdAt" AS at,
           us."planCode" || '|' || COALESCE(us."paymentProvider", 'unknown') AS d
      FROM user_subscriptions us
     WHERE us."currentPeriodStart" IS NOT NULL AND us."legacyPlanId" IS NULL
       AND ${IN_WINDOW(`us."createdAt"`)}`,
  },
  {
    key: "renewal",
    label: "Renewed",
    category: "retention",
    surface: "any",
    definition: "A second-or-later cycle of a subscription was paid.",
    source: "transactions (subscription money, cycle > 1 per the webhook stamp)",
    identity: "users.id",
    coverageFrom: "2026-08-17",
    caveat:
      "The first monthly renewals of the relaunched platform fall due from 2026-09-17; before " +
      "then this is almost empty by construction, not by churn.",
    sql: `
    SELECT 'u' || t."userId" AS pk, t."userId"::bigint AS uid, t."createdAt" AS at, NULL::text AS d
      FROM transactions t
     WHERE ${IN_WINDOW(`t."createdAt"`)}
       AND (t."razorpayPaymentId" IS NOT NULL OR t."legacyTransactionId" IS NOT NULL)
       AND COALESCE(t.kind, 'subscription') = 'subscription'
       AND lower(coalesce(t.status, '')) IN ('captured', 'paid', 'success')
       AND COALESCE(jsonb_typeof(t."paymentResponse" #> '{_hoopr,cycleNumber}') = 'number'
                    AND (t."paymentResponse" #>> '{_hoopr,cycleNumber}')::int > 1, FALSE)`,
  },
  {
    key: "cancelled",
    label: "Cancelled",
    category: "retention",
    surface: "any",
    definition:
      "An activated subscription was cancelled, or set to cancel at period end. `d` is ended | scheduled.",
    source: "user_subscriptions (activated rows only)",
    identity: "users.id",
    coverageFrom: "2026-08-17",
    sql: `
    SELECT 'u' || us."userId" AS pk, us."userId" AS uid, us."cancelledAt" AS at, 'ended' AS d
      FROM user_subscriptions us
     WHERE us."currentPeriodStart" IS NOT NULL AND us."cancelledAt" IS NOT NULL
       AND ${IN_WINDOW(`us."cancelledAt"`)}
    UNION ALL
    SELECT 'u' || us."userId", us."userId", us."updatedAt", 'scheduled'
      FROM user_subscriptions us
     WHERE us."currentPeriodStart" IS NOT NULL AND us."cancelAtPeriodEnd" AND us."cancelledAt" IS NULL
       AND ${IN_WINDOW(`us."updatedAt"`)}`,
  },

  // ── Value after subscribing ──
  {
    key: "whitelist",
    label: "Whitelisted a channel",
    category: "value",
    surface: "any",
    definition: "Submitted a channel for whitelisting (web), or had one whitelisted (app flow).",
    source:
      "POST /channel-whitelist → 2xx (request log) ∪ soundtracking_user_profiles " +
      "whitelistStatus sent/whitelisted",
    identity: "users.id",
    coverageFrom: "2026-08-17",
    caveat:
      "The profile table keeps only the LAST status change per channel, so an app whitelisting " +
      "is timed at its most recent update.",
    sql: `${apiRequest("POST", ["/channel-whitelist%"], `e."statusCode" < 300`, `'web'`)}
    UNION ALL
    SELECT 'u' || p."userId" AS pk, p."userId" AS uid, p."whitelistUpdatedAt" AS at, p.source AS d
      FROM soundtracking_user_profiles p
     WHERE p."whitelistStatus" IN ('sent', 'whitelisted')
       AND ${IN_WINDOW(`p."whitelistUpdatedAt"`)}`,
  },
  {
    key: "video_claim",
    label: "Claimed a video",
    category: "value",
    surface: "any",
    definition: "Submitted a video/reel that uses Hoopr music (Create & Earn claims). `d` is its status.",
    source: "video_links (creator rows, not rejected)",
    identity: "users.id",
    coverageFrom: "2026-08-17",
    sql: `
    SELECT 'u' || v."userId" AS pk, v."userId" AS uid, v."createdAt" AS at, v.status AS d
      FROM video_links v
     WHERE v."brandId" IS NULL AND v."userId" IS NOT NULL
       AND v.status NOT LIKE 'REJECTED%'
       AND ${IN_WINDOW(`v."createdAt"`)}`,
  },
  {
    key: "mix",
    label: "Exported a mix",
    category: "value",
    surface: "any",
    definition: "Rendered a custom stem mix in the mixer.",
    source: "creator_mixer_downloads (READY, platform CREATOR)",
    identity: "users.id",
    coverageFrom: "2026-08-27",
    sql: `
    SELECT 'u' || x.user_id AS pk, x.user_id AS uid, x.created_at AS at, x.format AS d
      FROM creator_mixer_downloads x
     WHERE x.status = 'READY' AND x.platform = 'CREATOR'
       AND ${IN_WINDOW("x.created_at")}`,
  },
];

export const ACTION_BY_KEY: Record<string, ActionSpec> = Object.fromEntries(
  ACTIONS.map((a) => [a.key, a]),
);

// ── The lifecycle ───────────────────────────────────────────────────────────

export interface StageSpec {
  key: string;
  label: string;
  question: string;
  /** Any one of these puts a person on the rung. */
  actions: readonly string[];
  /** Counted only AFTER this stage was reached (post-subscription value). */
  after?: string;
}

/**
 * The primary funnel.
 *
 * Activation deliberately excludes browsing (playlist opens, rail clicks,
 * filters): those are navigation, not value. It is search, a play, saving
 * music, starting a project or downloading — the moments someone got something
 * from the catalogue.
 *
 * Intent deliberately excludes running out of FREE plays — that prompt asks for
 * a sign-in, not money. It includes every action that is only possible with, or
 * only happens on the way to, a paid plan.
 */
export const STAGES: readonly StageSpec[] = [
  {
    key: "traffic",
    label: "Traffic",
    question: "How many people entered the platform?",
    actions: ["visit_web", "app_open"],
  },
  {
    key: "activation",
    label: "Activation",
    question: "How many experienced the product's value?",
    actions: ["search_web", "search_app", "stream", "save", "project", "download"],
  },
  {
    key: "signup",
    label: "Sign up",
    question: "How many created an account?",
    actions: ["account_created"],
  },
  {
    key: "intent",
    label: "Conversion intent",
    question: "How many showed they might pay?",
    actions: [
      "pricing_view",
      "pricing_entry",
      "paywall_download",
      "locked_feature",
      "checkout",
      "payment_failed",
    ],
  },
  {
    key: "subscription",
    label: "Subscription",
    question: "How many subscribed?",
    actions: ["subscribed"],
  },
  {
    key: "post_sub",
    label: "Post-subscription activation",
    question: "How many subscribers actually used what they paid for?",
    actions: ["download", "whitelist", "video_claim", "mix", "project"],
    after: "subscription",
  },
];

export const STAGE_KEYS = STAGES.map((s) => s.key);

// ── Sub-funnels ─────────────────────────────────────────────────────────────

export interface SubStep {
  label: string;
  /** Any of these, at or after the previous step. */
  actions: readonly string[];
  /** Only rows whose `d` is one of these. */
  detail?: readonly string[];
  /** Must happen on a LATER IST day than the previous step (repeat usage). */
  laterDay?: boolean;
  /** Must be a different row from the previous step with the same action (a repeat). */
  repeat?: boolean;
}

export interface SubFunnelSpec {
  key: string;
  group: "activation" | "signup" | "intent" | "subscription" | "post_sub";
  label: string;
  /** What this funnel answers. */
  question: string;
  steps: readonly SubStep[];
  /** Steps the product cannot report yet, shown so the gap is visible. */
  missing?: readonly string[];
}

const TRAFFIC: SubStep = { label: "Visited", actions: ["visit_web", "app_open"] };

/**
 * Ordered funnels. Each step must happen AT OR AFTER the one before it, per
 * person, which is what makes "search → stream → sign up" mean that order.
 */
export const SUB_FUNNELS: readonly SubFunnelSpec[] = [
  {
    key: "search",
    group: "activation",
    label: "Search → stream → sign up",
    question: "Does searching lead to listening, and listening to an account?",
    steps: [
      TRAFFIC,
      { label: "Searched", actions: ["search_web", "search_app"] },
      { label: "Played a track after searching", actions: ["stream"] },
      { label: "Signed up after", actions: ["account_created"] },
    ],
    missing: ["Search result clicked (no event carries which result was opened)"],
  },
  {
    key: "search_signup",
    group: "activation",
    label: "Search → sign up",
    question: "How many searchers go on to create an account?",
    steps: [
      TRAFFIC,
      { label: "Searched", actions: ["search_web", "search_app"] },
      { label: "Signed up after", actions: ["account_created"] },
    ],
  },
  {
    key: "stream",
    group: "activation",
    label: "Stream → repeat → sign up",
    question: "Do listeners come back for more, and does that turn into accounts?",
    steps: [
      TRAFFIC,
      { label: "Played a track", actions: ["stream"] },
      { label: "Played another", actions: ["stream"], repeat: true },
      { label: "Ran out of free plays", actions: ["free_plays_out"] },
      { label: "Signed up after", actions: ["account_created"] },
    ],
    missing: ["Listening time per play (only pause position is recorded)"],
  },
  {
    key: "search_quality",
    group: "activation",
    label: "Search quality",
    question: "Do searches find something worth keeping?",
    steps: [
      { label: "Searched (web)", actions: ["search_web"] },
      { label: "Played a track after", actions: ["stream"] },
      { label: "Heard one to the end", actions: ["stream_complete"] },
      { label: "Saved music", actions: ["save"] },
      { label: "Signed up", actions: ["account_created"] },
    ],
    missing: ["Results viewed / result clicked (no event)"],
  },
  {
    key: "signup_web",
    group: "signup",
    label: "Web sign-up, step by step",
    question: "Where exactly do people abandon signing up?",
    steps: [
      { label: "Opened sign-in", actions: ["auth_prompt"] },
      { label: "Requested a code", actions: ["otp_requested"] },
      { label: "Verified the code", actions: ["otp_verified"] },
      { label: "Started onboarding (new account)", actions: ["new_account_web"] },
      { label: "Completed onboarding", actions: ["onboarded"] },
    ],
    missing: [
      "Which onboarding screen was abandoned (no per-step event)",
      "Google sign-in has no code steps, so Google sign-ups leave this funnel after 'Opened sign-in' — see 'Sign-in → account → onboarding'",
    ],
  },
  {
    key: "signup_prompt",
    group: "signup",
    label: "Sign-in → account → onboarding",
    question: "Of the people who opened sign-in, how many ended up with a finished account (any method)?",
    steps: [
      { label: "Opened sign-in", actions: ["auth_prompt"] },
      { label: "Account created or logged in", actions: ["account_created", "login", "otp_verified"] },
      { label: "Completed onboarding", actions: ["onboarded"] },
    ],
  },
  {
    key: "signup_all",
    group: "signup",
    label: "Account → onboarding (all surfaces)",
    question: "How many new accounts never finish their profile?",
    steps: [
      { label: "Account created", actions: ["account_created"] },
      { label: "Completed onboarding", actions: ["onboarded"] },
    ],
  },
  {
    key: "intent_pricing",
    group: "intent",
    label: "Pricing → checkout → subscription",
    question: "Does a pricing visit convert?",
    steps: [
      { label: "Signed up", actions: ["account_created"] },
      { label: "Viewed pricing", actions: ["pricing_view"] },
      { label: "Started checkout", actions: ["checkout"] },
      { label: "Subscribed", actions: ["subscribed"] },
    ],
  },
  {
    key: "intent_download",
    group: "intent",
    label: "Download paywall → subscription",
    question: "Does being refused a download lead to paying?",
    steps: [
      { label: "Signed up", actions: ["account_created"] },
      { label: "Download blocked by paywall", actions: ["paywall_download"] },
      { label: "Viewed pricing", actions: ["pricing_view"] },
      { label: "Started checkout", actions: ["checkout"] },
      { label: "Subscribed", actions: ["subscribed"] },
    ],
  },
  {
    key: "intent_locked",
    group: "intent",
    label: "Paid feature → subscription",
    question: "Does trying stems or the mixer lead to paying?",
    steps: [
      { label: "Signed up", actions: ["account_created"] },
      { label: "Tried a paid feature", actions: ["locked_feature"] },
      { label: "Started checkout", actions: ["checkout"] },
      { label: "Subscribed", actions: ["subscribed"] },
    ],
  },
  {
    key: "intent_checkout",
    group: "intent",
    label: "Checkout → subscription",
    question: "How many checkouts become subscriptions?",
    steps: [
      { label: "Started checkout", actions: ["checkout"] },
      { label: "Subscribed", actions: ["subscribed"] },
    ],
    missing: [
      "Cart and cart view (the product has no cart — Subscribe opens checkout directly)",
      "Apple in-app checkout starts (only successes are recorded)",
    ],
  },
  {
    key: "subscription_core",
    group: "subscription",
    label: "Sign up → intent → checkout → subscription",
    question: "The whole path to money, in order.",
    steps: [
      { label: "Signed up", actions: ["account_created"] },
      { label: "Showed intent", actions: ["pricing_view", "pricing_entry", "paywall_download", "locked_feature"] },
      { label: "Started checkout", actions: ["checkout"] },
      { label: "Subscribed", actions: ["subscribed"] },
    ],
  },
  {
    key: "post_first_action",
    group: "post_sub",
    label: "Subscription → first core action",
    question: "Do subscribers start using what they paid for?",
    steps: [
      { label: "Subscribed", actions: ["subscribed"] },
      { label: "Did a core action", actions: ["download", "whitelist", "video_claim", "mix", "project"] },
      { label: "Came back another day", actions: ["download", "whitelist", "video_claim", "mix", "project", "search_web", "search_app", "stream"], laterDay: true },
    ],
  },
  {
    key: "post_download",
    group: "post_sub",
    label: "Subscription → download → repeat",
    question: "Do subscribers keep downloading?",
    steps: [
      { label: "Subscribed", actions: ["subscribed"] },
      { label: "Downloaded", actions: ["download"] },
      { label: "Downloaded again, another day", actions: ["download"], laterDay: true },
    ],
  },
  {
    key: "post_whitelist",
    group: "post_sub",
    label: "Subscription → whitelist → repeat usage",
    question: "Does whitelisting a channel lead to continued use?",
    steps: [
      { label: "Subscribed", actions: ["subscribed"] },
      { label: "Whitelisted a channel", actions: ["whitelist"] },
      { label: "Used Hoopr again, another day", actions: ["download", "whitelist", "video_claim", "mix", "search_web", "search_app", "stream"], laterDay: true },
    ],
  },
];

export const SUB_FUNNEL_KEYS = SUB_FUNNELS.map((f) => f.key);

// ── Segments ────────────────────────────────────────────────────────────────

export interface SegmentSpec {
  key: string;
  label: string;
  /** An expression over the person profile `pp`. */
  sql: string;
  note?: string;
}

/**
 * Person-level dimensions. Acquisition dimensions describe the person's FIRST
 * real web session (first touch), whatever window is being viewed.
 */
export const SEGMENTS: readonly SegmentSpec[] = [
  { key: "channel", label: "Acquisition channel", sql: "pp.channel", note: "From the first recorded web session. Referrer is known on 53% of first sessions; the rest read Direct. 'Internal' means that session came from another Hoopr page, so the real first visit was not recorded." },
  { key: "landing", label: "Landing page", sql: "pp.landing" },
  { key: "device", label: "Device", sql: "pp.device" },
  { key: "surface", label: "Surface", sql: "pp.surface" },
  { key: "auth_state", label: "Signed-in state", sql: "pp.auth_state" },
  { key: "visitor_type", label: "New vs returning", sql: "pp.visitor_type" },
  { key: "plan", label: "Subscription plan", sql: "pp.plan" },
  { key: "first_action", label: "First meaningful action", sql: "pp.first_action" },
  { key: "signup_method", label: "Signup method (web)", sql: "pp.signup_method" },
  { key: "utm_source", label: "UTM source", sql: "pp.utm_source", note: "Tagged on 5% of first sessions." },
  { key: "utm_campaign", label: "UTM campaign", sql: "pp.utm_campaign", note: "Tagged on 5% of first sessions." },
  { key: "profile_state", label: "State (from profile)", sql: "pp.profile_state", note: "Self-reported by ~20% of creators; sessions carry no geography." },
];

export const SEGMENT_BY_KEY: Record<string, SegmentSpec> = Object.fromEntries(
  SEGMENTS.map((s) => [s.key, s]),
);

export const SEGMENT_KEYS = SEGMENTS.map((s) => s.key);

/**
 * First-touch channel, in priority order: explicit paid click ids, campaign
 * tags, our own referral and share links, then the referring domain.
 */
export const CHANNEL_SQL = (f: string) => `CASE
      WHEN ${f}."startedAt" IS NULL THEN 'App (no web visit)'
      WHEN ${f}.gclid IS NOT NULL THEN 'Paid search'
      WHEN ${f}.fbclid IS NOT NULL THEN 'Paid social'
      WHEN ${f}."refCode" IS NOT NULL THEN 'Referral program'
      WHEN ${f}."shareToken" IS NOT NULL THEN 'Share link'
      WHEN lower(COALESCE(${f}."utmMedium", '')) IN ('cpc', 'ppc', 'paid', 'paid_social', 'ads') THEN 'Paid campaign'
      WHEN lower(COALESCE(${f}."utmMedium", '')) = 'email' OR lower(COALESCE(${f}."utmSource", '')) = 'email' THEN 'Email'
      WHEN ${f}."utmSource" IS NOT NULL OR ${f}."utmCampaign" IS NOT NULL THEN 'Campaign'
      WHEN ${f}."referrerDomain" ~* '(^|\\.)(google|bing|duckduckgo|yahoo|ecosia|brave|yandex|baidu)\\.|googlequicksearchbox' THEN 'Search'
      WHEN ${f}."referrerDomain" ~* 'chatgpt|openai|perplexity|gemini|claude|copilot' THEN 'AI assistant'
      WHEN ${f}."referrerDomain" ~* 'facebook|instagram|youtube|t\\.co$|twitter|x\\.com|linkedin|whatsapp|reddit|pinterest|snapchat|telegram|threads' THEN 'Social'
      WHEN ${f}."referrerDomain" ~* '(^|\\.)hoopr\\.' THEN 'Internal (first visit not captured)'
      WHEN ${f}."referrerDomain" IS NOT NULL THEN 'Other website'
      ELSE 'Direct'
    END`;

/** The landing page, by section rather than by URL, so it groups. */
export const LANDING_SQL = (f: string) => `CASE
      WHEN ${f}."landingPath" IS NULL THEN '(unknown)'
      WHEN split_part(${f}."landingPath", '?', 1) IN ('/', '') THEN 'Home'
      WHEN ${f}."landingPath" ~ '^/(music|sfx|use-case|moods|genres)(\\?|/|$)' THEN 'Browse home'
      WHEN ${f}."landingPath" ~ '^/playlist' THEN 'Playlist'
      WHEN ${f}."landingPath" ~ '^/track' THEN 'Track page'
      WHEN ${f}."landingPath" ~ '^/(browse|rail)' THEN 'Genre / language'
      WHEN ${f}."landingPath" ~ '^/artist' THEN 'Artist'
      WHEN ${f}."landingPath" ~ '^/pricing' THEN 'Pricing'
      WHEN ${f}."landingPath" ~ '^/search' THEN 'Search'
      WHEN ${f}."landingPath" ~ '^/(blog|faq|about|contact|legal|terms|privacy)' THEN 'Content / support'
      WHEN ${f}."landingPath" ~ '^/(account|s/)' THEN 'Account / share link'
      ELSE 'Other'
    END`;

// ── Metric dictionary ───────────────────────────────────────────────────────

export interface MetricDoc {
  name: string;
  definition: string;
  source: string;
  calculation: string;
  identity: string;
}

/** The headline metrics, documented once. Stage and action entries are generated from the specs above. */
export const METRIC_DOCS: readonly MetricDoc[] = [
  {
    name: "Unique people (any stage)",
    definition: "Distinct persons who did any of the stage's actions.",
    source: "The stage's actions",
    calculation: "count(DISTINCT pk)",
    identity: "pk = u<user id> once known, else v<browser id>; anonymous browsing is credited to the account the browser first signed into.",
  },
  {
    name: "Journey funnel (cohort mode)",
    definition:
      "People whose FIRST-EVER appearance falls in the window, followed for the conversion window. A person counts at a rung when they reached it and every rung above it (any order), each within the conversion window of their first appearance. Post-subscription activation must follow the subscription.",
    source: "All stage actions, plus first appearance from native_sessions, users and user_sessions",
    calculation: "Nested counts; conversion = rung / previous rung; drop-off = previous − rung",
    identity: "As above. First appearance = earliest of first real web session, account creation, first app login.",
  },
  {
    name: "Activity (monitoring mode)",
    definition:
      "Everyone active in the window, and how many of them did each thing IN the window. Not nested — a subscriber renewing today need not have signed up today — so the ratios between rungs are ratios, not conversion rates.",
    source: "All stage actions inside the window",
    calculation: "count(DISTINCT pk) per stage; ratio = stage / previous stage",
    identity: "As above",
  },
  {
    name: "Stage-to-stage conversion",
    definition: "Share of the previous rung that also reached this rung.",
    source: "Journey funnel",
    calculation: "rung ÷ previous rung × 100",
    identity: "Same persons on both rungs",
  },
  {
    name: "Traffic-to-stage conversion",
    definition: "Share of the top rung that reached this rung.",
    source: "Journey funnel",
    calculation: "rung ÷ traffic × 100",
    identity: "Same persons",
  },
  {
    name: "Time to signup / subscription / first value",
    definition: "Median time from a person's first appearance (or subscription) to the milestone.",
    source: "Journey funnel reach times",
    calculation: "percentile_cont(0.5) of (milestone − start)",
    identity: "Per person, first occurrence of each",
  },
  {
    name: "Searches / streams / downloads per person",
    definition: "Rows of that action divided by the people who did it at least once.",
    source: "search_web + search_app / stream / download",
    calculation: "count(rows) ÷ count(DISTINCT pk)",
    identity: "As above; searches are de-duplicated across the web event and the search log",
  },
  {
    name: "Retention (day N)",
    definition:
      "Of subscribers who subscribed at least N days ago, the share with any recorded activity on or after day N. Rolling retention — activity on any later day counts.",
    source: "visit_web, app_open, search, stream, download, whitelist, video_claim, mix after the subscription",
    calculation: "active on/after day N ÷ eligible (subscribed ≥ N days before today)",
    identity: "users.id",
  },
  {
    name: "Cancellation / renewal rate",
    definition: "Share of activated subscriptions that were cancelled (or scheduled to cancel), or renewed.",
    source: "user_subscriptions, transactions",
    calculation: "count ÷ activated subscriptions in the cohort",
    identity: "users.id",
  },
  {
    name: "Insight significance",
    definition:
      "A change in a rate is reported only when a two-proportion z-test gives |z| ≥ 1.96 (≈95%) and both periods have at least 30 people in the denominator. Insights state the numbers; they never state a cause.",
    source: "Current vs previous period of the same length",
    calculation: "z = (p1 − p2) / sqrt(p(1−p)(1/n1 + 1/n2))",
    identity: "As the metric compared",
  },
];

// ── The audit: what is NOT tracked ──────────────────────────────────────────

export interface GapSpec {
  area: string;
  gap: string;
  impact: string;
  proposal: string;
  owner: string;
}

/**
 * The event audit's findings, 2026-09-16. Kept in code so the Data Audit view
 * shows them next to the live coverage and they are removed when fixed.
 */
export const KNOWN_GAPS: readonly GapSpec[] = [
  {
    area: "App",
    gap: "The Android/iOS app emits no product events at all.",
    impact:
      "App streams, screen views, paywalls, pricing views and Apple checkout starts are invisible. App traffic is inferred from logins and is a lower bound.",
    proposal:
      "Send the existing taxonomy (TRACK_PLAY, SEARCH, SCREEN_VIEW, PRICING_VIEWED, CHECKOUT_STARTED …) to NATIVE-BE POST /analytics/events with clientType=MOBILE_APP.",
    owner: "Mobile app",
  },
  {
    area: "Search",
    gap: "No event says which search result was opened.",
    impact: "Search → result click → play cannot be measured; the funnel skips from search to play.",
    proposal: "SEARCH_RESULT_CLICK with query, position, result type and code.",
    owner: "creator-web",
  },
  {
    area: "Search",
    gap: "Anonymous searches before 2026-09-15 have no person.",
    impact: "Search activation history before that date covers signed-in creators only.",
    proposal: "None needed going forward — the SEARCH event covers it.",
    owner: "—",
  },
  {
    area: "Streaming",
    gap: "Plays carry no listening duration.",
    impact: "Stream duration and 'real listen' thresholds cannot be computed.",
    proposal: "Add listenedMs to TRACK_PAUSE / TRACK_COMPLETE, or a TRACK_PROGRESS heartbeat.",
    owner: "creator-web",
  },
  {
    area: "Sign-up",
    gap: "Onboarding has no per-screen events.",
    impact: "Abandonment is known up to 'started onboarding', not the exact screen.",
    proposal: "ONBOARDING_STEP_VIEWED / ONBOARDING_STEP_COMPLETED with the step name.",
    owner: "creator-web",
  },
  {
    area: "Sign-up",
    gap: "Web auth events only exist from 2026-09-16.",
    impact: "The step-by-step signup funnel has no history before that day.",
    proposal: "None — it fills from now on.",
    owner: "—",
  },
  {
    area: "Traffic",
    gap: "Sessions carry no geography (countryCode empty on every row).",
    impact: "Traffic cannot be segmented by country or city; only self-reported profile state exists.",
    proposal: "Forward the client IP from the creator-web BFF and enable the geo lookup in NATIVE-BE.",
    owner: "creator-web + NATIVE-BE",
  },
  {
    area: "Traffic",
    gap: "Referrer is recorded on 53% of first sessions, campaign tags on 5%.",
    impact: "Most traffic without a referrer reads as Direct; campaign attribution is thin.",
    proposal: "Tag every outbound campaign link with utm_*; keep the landing-page capture as is.",
    owner: "Marketing",
  },
  {
    area: "Conversion",
    gap: "PAYMENT_INITIATED / SUBSCRIPTION_STARTED / PAYMENT_FAILED shipped 2026-09-16.",
    impact: "Checkout → payment drop-off has no history before then; 65% of checkouts never activate.",
    proposal: "None — fills from now on.",
    owner: "—",
  },
  {
    area: "Conversion",
    gap: "Apple in-app checkout starts are not recorded.",
    impact: "App checkout abandonment is invisible; only successful Apple purchases appear.",
    proposal: "Log the StoreKit purchase start from the app (see App above).",
    owner: "Mobile app",
  },
  {
    area: "Retention",
    gap: "Renewals of the relaunched platform only begin 2026-09-17.",
    impact: "Renewal analysis is empty for now; retention uses activity and cancellation instead.",
    proposal: "None — matures with time.",
    owner: "—",
  },
  {
    area: "Value",
    gap: "App whitelisting keeps only the latest status change per channel.",
    impact: "Time-to-first-whitelist for app users uses the most recent change.",
    proposal: "Append whitelist status changes to a history table in content-recommendation.",
    owner: "content-recommendation",
  },
  {
    area: "Identity",
    gap: "App usage before login is not tracked, and app ↔ web are linked only by account.",
    impact: "Pre-signup app behaviour cannot be attributed.",
    proposal: "Give the app a durable install id and send it with events (see App above).",
    owner: "Mobile app",
  },
];
