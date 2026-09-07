// ─── Creator Users & Analytics — shared vocabulary ───────────────────────────
//
// One dashboard answering "what is happening on the Creator platform, and to
// whom" — the acquisition funnel (anonymous visitor → signup → subscriber →
// renewal, with the money at each rung) and the activity underneath it
// (downloads, favourites, collections, claims, referrals, payouts), every
// figure openable into the paginated rows it was computed from.
//
// ── WHY IT LIVES IN unified-backend ─────────────────────────────────────────
// Same reason native-analytics does, and the header there says it best:
// NATIVE-BE writes the session/event data, unified reads it. This service is
// already on the same Postgres, and already owns the internal-user sessions and
// functionality grants these endpoints have to be gated by. There is no service
// hop to make and no auth to duplicate.
//
// ── ONE VOCABULARY, BORROWED NOT REINVENTED ─────────────────────────────────
// Every definition that already exists somewhere else in the estate is imported
// or copied verbatim, with a pointer back to the original:
//
//   · IST day boundaries, `q`, `pct`, `previousPeriod`, `delta`
//        → native-analytics-shared.ts
//   · what a real payment is, what a renewal is, what counts as subscription
//     money (TX_REAL / TX_SCOPE / TX_RENEWAL / TX_FIRST_PAYMENT)
//        → NATIVE-BE src/modules/subscriptions/subscriptions-admin.constants.ts
//   · web vs Android vs iOS for a creator (`originExpr`)
//        → whitelisting/whitelisting-shared.ts
//
// This is not tidiness. Two internal dashboards that disagree about MRR, or
// about when yesterday ended, or about who is an app user, produce a support
// ticket nobody can close — the same warning already sits at the top of
// native-analytics-shared.ts and of the NATIVE-BE constants. If any of those
// originals change, change these with them.

import {
  q,
  num,
  pct,
  round1,
  istDay,
  previousPeriod,
  delta,
  per,
} from "../native-analytics/native-analytics-shared";
import { QueryTypes } from "sequelize";
import { sequelize } from "../../persistence-service/database";

export { q, num, pct, round1, istDay, previousPeriod, delta, per };

// ── Optional tables ─────────────────────────────────────────────────────────
//
// This module reaches across the whole shared DB — tables owned by
// unified-backend (`transactions`, `licenses`), by content-recommendation
// (`video_links`, `withdrawals`, `user_sessions`) and by NATIVE-BE
// (`native_sessions`, `collections`, `native_referrals`). Not every environment
// has all of them: staging is missing several, and a dashboard that 500s
// because one optional table is absent is worse than one that says "nothing
// recorded here".
//
// So each table is probed once per process with `to_regclass` and a missing one
// degrades that ONE metric instead of the request. The same shape NATIVE-BE's
// AdminUserDetailService uses, and the same guard whitelisting-shared applies
// to `_merge_all_map`.

const tableCache = new Map<string, boolean>();

export const tableExists = async (table: string): Promise<boolean> => {
  const cached = tableCache.get(table);
  if (cached !== undefined) return cached;
  let present = false;
  try {
    const rows = (await sequelize.query(
      `SELECT to_regclass(:name) IS NOT NULL AS ok`,
      { replacements: { name: `public.${table}` }, type: QueryTypes.SELECT },
    )) as { ok: boolean }[];
    present = Boolean(rows?.[0]?.ok);
  } catch {
    present = false;
  }
  tableCache.set(table, present);
  return present;
};

/** Probes many at once, for the "which metrics can this environment answer" map. */
export const tablesExist = async (
  tables: readonly string[],
): Promise<Record<string, boolean>> => {
  const out: Record<string, boolean> = {};
  await Promise.all(
    tables.map(async (t) => {
      out[t] = await tableExists(t);
    }),
  );
  return out;
};

// ── The window ──────────────────────────────────────────────────────────────
//
// Inclusive IST calendar days on both ends, as everywhere else in this CMS. A
// UTC boundary would file 5.5 hours of Indian evening activity under the wrong
// day and put this dashboard's "today" out of step with the others.

export const RANGE_START = `((:startDate)::date)::timestamp AT TIME ZONE 'Asia/Kolkata'`;
export const RANGE_END = `((:endDate)::date + 1)::timestamp AT TIME ZONE 'Asia/Kolkata'`;

/** `col` falls inside the requested window. */
export const inRange = (col: string): string =>
  `${col} >= ${RANGE_START} AND ${col} < ${RANGE_END}`;

/** Filters every endpoint in this module accepts. */
export interface CreatorFilters {
  /** Inclusive IST calendar day, YYYY-MM-DD. */
  startDate: string;
  /** Inclusive IST calendar day, YYYY-MM-DD. */
  endDate: string;
  /**
   * WEB | ANDROID | IOS | APP, per `originExpr`. Absent means every origin.
   *
   * Read the caveat on ORIGIN_NOTE before quoting a number split by this.
   */
  origin?: string | null;
  [key: string]: unknown;
}

export const rangeBinds = (f: CreatorFilters): Record<string, unknown> => ({
  startDate: f.startDate,
  endDate: f.endDate,
  origin: f.origin ?? null,
});

/**
 * Narrows to one origin, or to all of them when none was asked for.
 *
 * Written as `(CAST(:origin AS text) IS NULL OR ...)` rather than assembled
 * conditionally, so there is exactly one SQL string per query to read — the
 * same convention as native-analytics-shared's filter clauses.
 *
 * `alias` is the column holding an already-computed origin, never the ladder
 * itself: the ladder runs up to four correlated EXISTS and belongs in a CTE
 * evaluated once, not inlined into every FILTER clause.
 */
export const originWhere = (col = "origin"): string =>
  `(CAST(:origin AS text) IS NULL OR ${col} = :origin)`;

export const ORIGINS = ["WEB", "ANDROID", "IOS", "APP"] as const;
export type Origin = (typeof ORIGINS)[number];

export const ORIGIN_LABELS: Record<string, string> = {
  WEB: "Web",
  ANDROID: "Android app",
  IOS: "iOS app",
  APP: "App (OS unknown)",
};

/**
 * `WITH creator_users AS (...)` — every CREATOR account plus its derived origin.
 *
 * The ladder is `originExpr()` from whitelisting-shared, unchanged, so this
 * dashboard, the whitelisting CMS and the Subscriptions dashboard give the same
 * answer for the same person. It is materialised once here because inlining it
 * would re-run four correlated EXISTS per aggregate clause.
 *
 * Measured on prod (461,742 CREATOR rows): 0.6s for the whole table, so it is
 * cheap enough to build unfiltered and join to.
 *
 * ── `materialized` IS NOT A MICRO-OPTIMISATION ──────────────────────────────
 *
 * Postgres INLINES a plain CTE, which means the origin ladder — four
 * correlated EXISTS per user — is re-evaluated once per REFERENCE to
 * `cu.origin`, not once per row. One reference is fine and is what every
 * drill-down and metric query needs, because inlining is also what lets the
 * planner push a join or a `WHERE cu.id = …` down into an index seek instead
 * of building all 461k rows.
 *
 * A query that references `cu.origin` several times is the opposite case.
 * Measured on prod: the overview's People query, with four
 * `count(*) FILTER (WHERE cu.origin = …)` clauses, ran the ladder four times
 * over the whole table and did not finish inside the statement timeout
 * (>300s). With `AS MATERIALIZED` it is **1.4s**.
 *
 * So: pass `materialized: true` when the query reads `origin` more than once,
 * and leave it off otherwise. Forcing it everywhere would slow every
 * drill-down down to a full 461k build.
 */
export const creatorUsersCte = async (
  opts: { materialized?: boolean } = {},
): Promise<string> => {
  const merge = await tableExists("_merge_all_map");
  const appArms = [`u.platform = 'SOUND_TRACKING_APP'`];
  if (merge) {
    appArms.push(`EXISTS (SELECT 1 FROM _merge_all_map _mm WHERE _mm.cr_id = u.id)`);
  }
  appArms.push(`EXISTS (SELECT 1 FROM user_sessions _us WHERE _us."userId" = u.id)`);

  return `
    creator_users AS ${opts.materialized ? "MATERIALIZED " : ""}(
      SELECT u.id, u."createdAt", u.email, u.mobile, u."countryCode",
             u."firstName", u."lastName", u.status, u.city, u.state, u.country,
             CASE
               WHEN EXISTS (SELECT 1 FROM user_subscriptions _as
                             WHERE _as."userId" = u.id
                               AND _as."paymentProvider" = 'apple')          THEN 'IOS'
               WHEN EXISTS (SELECT 1 FROM user_sessions _os
                             WHERE _os."userId" = u.id AND _os.os ILIKE 'ios%')     THEN 'IOS'
               WHEN EXISTS (SELECT 1 FROM user_sessions _os
                             WHERE _os."userId" = u.id AND _os.os ILIKE 'android%') THEN 'ANDROID'
               WHEN ${appArms.join(" OR ")}                                  THEN 'APP'
               ELSE 'WEB'
             END AS origin
        FROM users u
       WHERE u.platform = 'CREATOR'
    )`;
};

/**
 * The `WITH …` prefix a metric's query needs, or an empty string.
 *
 * User-scoped metrics get the `creator_users` CTE; catalogue metrics get
 * nothing, because there is no owner to join to. Returned as the whole prefix
 * (keyword included) so callers interpolate one value instead of assembling
 * `WITH` themselves and having to special-case the empty side.
 */
export const cteFor = async (m: {
  scope?: "user" | "catalogue";
}): Promise<string> =>
  (m.scope ?? "user") === "catalogue" ? "" : `WITH ${await creatorUsersCte()}`;

/** A creator's display name, for every drill-down row. */
export const USER_NAME_SQL = `NULLIF(btrim(
  COALESCE(cu."firstName", '') || ' ' || COALESCE(cu."lastName", '')), '')`;

// ── Money, mirrored from NATIVE-BE ──────────────────────────────────────────
//
// Copied verbatim from src/modules/subscriptions/subscriptions-admin.constants.ts
// so the funnel's revenue agrees with the Subscriptions dashboard to the rupee.
// The reasoning behind each one lives there in full; the short version is kept
// here because someone editing this file needs to know what they must not
// "simplify".

/**
 * A real payment, whichever stack collected it. `legacyTransactionId` is what
 * the legacy-hoopr backfill stamped — without that arm, Rs 1.75Cr of migrated
 * money disappears from every total.
 */
export const TX_REAL = `(t."razorpayPaymentId" IS NOT NULL OR t."legacyTransactionId" IS NOT NULL)`;

/** A plan cycle rather than a one-off licence sale. */
export const TX_SUBSCRIPTION_KIND = `COALESCE(t.kind, 'subscription') = 'subscription'`;

/** Money actually arrived. */
export const TX_PAID = `lower(coalesce(t.status, '')) IN ('captured', 'paid', 'success')`;

/** Every `transactions` row the subscription book counts. */
export const TX_SCOPE = `(${TX_REAL} AND ${TX_SUBSCRIPTION_KIND} AND ${TX_PAID})`;

/**
 * A RENEWAL — the second or later cycle of a mandate.
 *
 * Read from the cycle number the subscription webhook stamps, NEVER inferred
 * from the payment description: Razorpay writes "Recurring Payment via
 * Subscription" on first charges too, and that inference called 86 payments
 * renewals when only 68 were.
 */
export const TX_RENEWAL = `(
      CASE
        WHEN jsonb_typeof(t."paymentResponse" #> '{_hoopr,cycleNumber}') = 'number'
          THEN (t."paymentResponse" #>> '{_hoopr,cycleNumber}')::int > 1
        WHEN COALESCE(t."paymentMethod" = 'apple_iap', FALSE)
          THEN t."createdAt" > (
                 SELECT MIN(t2."createdAt") FROM transactions t2
                  WHERE t2."userId" = t."userId"
                    AND t2."paymentMethod" = 'apple_iap'
                    AND lower(coalesce(t2.status, '')) IN ('captured', 'paid', 'success')
               )
        ELSE FALSE
      END
    )`;

/**
 * Do we know which cycle this payment was for?
 *
 * COALESCE'd to FALSE deliberately: `jsonb_typeof` of an absent path returns
 * NULL, and an unwrapped comparison then makes a CASE fall through while a
 * FILTER excludes — the buckets stop summing to the total in two directions at
 * once.
 */
export const TX_CYCLE_KNOWN = `(
      COALESCE(jsonb_typeof(t."paymentResponse" #> '{_hoopr,cycleNumber}') = 'number', FALSE)
      OR COALESCE(t."paymentMethod" = 'apple_iap', FALSE)
    )`;

/** A first charge — known cycle 1, or a one-off with no cycle. */
export const TX_FIRST_PAYMENT = `(${TX_CYCLE_KNOWN} AND ${TX_RENEWAL} IS NOT TRUE)`;

/** Neither, and its own bucket rather than quietly folded into "first". */
export const TX_UNCLASSIFIED = `(${TX_CYCLE_KNOWN}) IS NOT TRUE`;

export const PAYMENT_KIND_EXPR = `
    CASE
      WHEN ${TX_UNCLASSIFIED}    THEN 'unclassified'
      WHEN ${TX_RENEWAL} IS TRUE THEN 'renewal'
      ELSE 'first'
    END`;

// ── The caveats that travel with the numbers ────────────────────────────────
//
// Stated in the payload rather than only in a tooltip, because a figure quoted
// out of this dashboard into a deck outlives any UI copy. Same reason
// NATIVE-BE ships RENEWAL_NOTE alongside its renewal counts.

export const RENEWAL_NOTE =
  "A renewal is the second or later cycle of a mandate, read from the cycle " +
  "number the subscription webhook stamps on each payment (Apple IAP falls " +
  "back to ordinal, having no cycle to stamp). Payments written before " +
  "stamping began show as “Cycle unknown” until the backfill has run " +
  "over them; they are counted neither as renewals nor as first payments. " +
  "Renewals only reach this table from 2026-08-17, when the " +
  "subscription.charged handler went live.";

export const REVENUE_NOTE =
  "Revenue is subscription money only — `transactions` rows for a plan " +
  "cycle that a payment id (Razorpay or the legacy backfill) proves arrived. " +
  "Licence purchases and wallet payouts are not in it. Failed and abandoned " +
  "payments are not recorded in this table at all, so a conversion rate here " +
  "cannot see checkout drop-off.";

export const ORIGIN_NOTE =
  "Origin is DERIVED, not stored — every creator is platform='CREATOR' " +
  "whether they signed up on web, Android or iOS. The ladder is Apple receipt " +
  "→ an iOS/Android app session → any app session → otherwise " +
  "web, identical to the Channel Whitelisting and Subscriptions CMSes. " +
  "Read WEB as “no app evidence” rather than as proof of a web " +
  "signup: the 452k consumers bulk-loaded by the legacy migration have no " +
  "session rows of either kind and all land there.";

export const SESSION_NOTE =
  "Visitor and session figures come from `native_sessions`, which NATIVE-BE " +
  "only began writing on 2026-08-17. A window starting before that date has " +
  "signups and revenue but no traffic to compare them against, so the top of " +
  "the funnel will read as zero rather than as a collapse.";

/**
 * The first day traffic capture actually covers.
 *
 * Probed rather than hardcoded so the warning above disappears on its own once
 * the window no longer predates capture, and so a fresh staging DB (where the
 * table is empty) does not claim a coverage start it does not have.
 */
export const captureStart = async (): Promise<string | null> => {
  const [row] = await q<{ day: string | null }>(
    `SELECT to_char(min("startedAt") AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD') AS day
       FROM native_sessions`,
  );
  return row?.day ?? null;
};
