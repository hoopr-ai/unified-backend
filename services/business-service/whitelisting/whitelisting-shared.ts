// ─── YouTube Whitelisting — shared vocabulary, origin derivation, helpers ────
//
// Backs the internal-fe "YouTube Whitelisting" CMS, which has two surfaces:
//
//   Channel Whitelisting  triage soundtracking_user_profiles rows a subscriber
//                         submitted for clearance (not_sent → sent → whitelisted
//                         | rejected)
//   Claim Clearance       triage `claims` rows — a creator pasted a video URL
//                         asking for a copyright claim to be released
//
// WHY THIS LIVES IN unified-backend AND NOT IN NATIVE-BE: same reasoning as
// native-analytics — NATIVE-BE and content-recommendation point at this exact
// Postgres, so there is no service hop to make, and this service already owns
// internal-user sessions, roles and the functionality grants these endpoints
// must be gated by. The product services write; the CMS reads and triages.
//
// The channel status vocabulary is NOT invented here. It is the set already
// written by NATIVE-BE's ChannelWhitelistService and by the Python
// channel_whitelist_admin_db, and it must stay byte-identical to both or the
// creator's app and this CMS will disagree about what a channel's state is.

import { QueryTypes } from "sequelize";
import { sequelize } from "../../persistence-service/database";

export { q, num } from "../enterprise-analytics/analytics-shared";

// ── Vocabulary ──────────────────────────────────────────────────────────────

// soundtracking_user_profiles."whitelistStatus".
//
// 'not_sent' is stored as NULL on the row (that is the Python admin layer's
// convention and the column default), so every read COALESCEs and every write
// of 'not_sent' writes NULL. Reads and writes must agree or a reset channel
// would read back as a status that no filter matches.
export const WHITELIST_STATUSES = [
  "not_sent",
  "sent",
  "whitelisted",
  "rejected",
] as const;
export type WhitelistStatus = (typeof WHITELIST_STATUSES)[number];

export const WHITELIST_STATUS_LABELS: Record<WhitelistStatus, string> = {
  not_sent: "Not submitted",
  sent: "Awaiting review",
  whitelisted: "Whitelisted",
  rejected: "Rejected",
};

// The manager's ask names the section "YouTube Whitelisting", but creators
// submit Instagram and Facebook channels through the same flow and they land in
// the same queue. All three are first-class here; the section name is kept as
// the vocabulary ops already uses.
export const CHANNEL_SOURCES = ["youtube", "instagram", "facebook"] as const;
export type ChannelSource = (typeof CHANNEL_SOURCES)[number];

// claims.status — owned by NATIVE-BE's claim.constants.ts. Restated (not
// imported: separate service, separate repo) and asserted identical there.
export const CLAIM_STATUSES = [
  "PENDING",
  "IN_REVIEW",
  "RESOLVED",
  "REJECTED",
] as const;
export type ClaimStatus = (typeof CLAIM_STATUSES)[number];

export const CLAIM_STATUS_LABELS: Record<ClaimStatus, string> = {
  PENDING: "Pending",
  IN_REVIEW: "In review",
  RESOLVED: "Resolved",
  REJECTED: "Rejected",
};

// claims.platform — the SOCIAL NETWORK the reported video sits on. Not the same
// `platform` as users.platform (CREATOR / STUDIO / ENTERPRISE); NATIVE-BE calls
// it VIDEO_PLATFORMS for exactly that reason and so does this file.
export const VIDEO_PLATFORMS = ["YOUTUBE", "INSTAGRAM", "FACEBOOK"] as const;
export type VideoPlatform = (typeof VIDEO_PLATFORMS)[number];

// Subscription statuses that mean "this person is paying us right now". Mirrors
// NATIVE-BE's LIVE_SUB_STATUSES — a past_due subscriber has not churned, they
// have a failed card, and refusing to clear their channel over it is the kind
// of thing that generates the complaints this dashboard exists to stop.
export const LIVE_SUB_STATUSES = ["active", "past_due"] as const;

// ── Origin: Web / Android / iOS ─────────────────────────────────────────────
//
// THE HARD PART, and worth reading before trusting the column.
//
// There is no stored "where did this account come from" field. `users.platform`
// cannot answer it: the 2026-08-17 migration bulk-loaded ~452k legacy consumers
// as platform='CREATOR' and merge_platforms.py folded every SOUND_TRACKING_APP
// row into its CREATOR twin, so there are ZERO SOUND_TRACKING_APP rows left in
// prod. Both the app backend (content-recommendation) and the web backend
// (NATIVE-BE) stamp the same 'CREATOR'.
//
// So origin is derived from EVIDENCE, in the same three arms
// content-recommendation/st_dash_db.app_cohort() uses — this CMS and the app
// dashboards must not disagree about who is an app user:
//
//   1. platform = 'SOUND_TRACKING_APP'  — only ever written by the app. Zero
//      rows in prod today; kept for staging and for a merge rollback.
//   2. _merge_all_map.cr_id             — the 3,336 pre-merge app users the
//      merge renamed into CREATOR. Without this arm ~2,130 of them read as Web.
//   3. a row in user_sessions           — creator_auth._issue_login_session
//      writes it on EVERY app login/signup. NATIVE-BE never writes that table,
//      and the legacy bulk import did not either. Self-maintaining, and it
//      correctly reclassifies a web user who later installs the app.
//
// Android vs iOS then needs a second signal, and there are exactly two:
//   · user_sessions.os — recorded by the app on login. The direct answer.
//   · user_subscriptions."paymentProvider" = 'apple' — an IAP subscription can
//     only have been bought inside the iOS app. Proof of iOS even when no
//     session row survived.
//
// A user with app evidence but no OS on any session is reported as 'APP'
// (known app, unknown OS) rather than being guessed into Android. Guessing here
// would be indistinguishable from data, and this column gets used to decide
// where to spend engineering time.
//
// _merge_all_map is prod-only, so it is probed via to_regclass and the arm is
// dropped on environments that lack it — the same guard app_cohort() applies.
export const APP_PLATFORMS = ["SOUND_TRACKING_APP", "CREATOR"];

let mergeMapPresent: boolean | null = null;

/** One catalog hit per process, cached — mirrors st_dash_db._has_merge_map(). */
const hasMergeMap = async (): Promise<boolean> => {
  if (mergeMapPresent === null) {
    try {
      const rows = (await sequelize.query(
        `SELECT to_regclass('public._merge_all_map') IS NOT NULL AS ok`,
        { type: QueryTypes.SELECT },
      )) as { ok: boolean }[];
      mergeMapPresent = Boolean(rows?.[0]?.ok);
    } catch {
      mergeMapPresent = false;
    }
  }
  return mergeMapPresent;
};

export type Origin = "WEB" | "ANDROID" | "IOS" | "APP";

/**
 * A SQL scalar expression yielding 'WEB' | 'ANDROID' | 'IOS' | 'APP' for the
 * user aliased as `alias`.
 *
 * Returned as a string to be interpolated into a SELECT rather than bound:
 * it contains no caller input at all — `alias` is supplied by this module's own
 * queries and the arms are literals — so there is nothing here to parameterise.
 *
 * Evaluation order matters. iOS is checked first because an Apple IAP receipt
 * is the strongest evidence available and outranks a stale Android session on a
 * user who switched phones.
 */
export const originExpr = async (alias = "u"): Promise<string> => {
  const a = `${alias}.`;
  const appArms = [`${a}platform = 'SOUND_TRACKING_APP'`];
  if (await hasMergeMap()) {
    appArms.push(
      `EXISTS (SELECT 1 FROM _merge_all_map _mm WHERE _mm.cr_id = ${a}id)`,
    );
  }
  appArms.push(
    `EXISTS (SELECT 1 FROM user_sessions _us WHERE _us."userId" = ${a}id)`,
  );

  return `
    CASE
      WHEN EXISTS (SELECT 1 FROM user_subscriptions _as
                    WHERE _as."userId" = ${a}id
                      AND _as."paymentProvider" = 'apple')
        THEN 'IOS'
      WHEN EXISTS (SELECT 1 FROM user_sessions _os
                    WHERE _os."userId" = ${a}id AND _os.os ILIKE 'ios%')
        THEN 'IOS'
      WHEN EXISTS (SELECT 1 FROM user_sessions _os
                    WHERE _os."userId" = ${a}id AND _os.os ILIKE 'android%')
        THEN 'ANDROID'
      WHEN ${appArms.join(" OR ")}
        THEN 'APP'
      ELSE 'WEB'
    END`;
};

/** Filterable origin values, in the order the CMS dropdown shows them. */
export const ORIGINS: Origin[] = ["WEB", "ANDROID", "IOS", "APP"];

export const ORIGIN_LABELS: Record<Origin, string> = {
  WEB: "Web",
  ANDROID: "Android app",
  IOS: "iOS app",
  APP: "App (OS unknown)",
};

// ── Write helper ────────────────────────────────────────────────────────────
//
// `q` from analytics-shared is hard-typed to QueryTypes.SELECT because that
// dashboard never writes. This CMS does, so writes go through here.
//
// Deliberately returns nothing: every write in this module is followed by a
// read of the row it touched, so callers never depend on the driver's
// UPDATE-return shape (which differs between `[rows, count]` and `rows`
// depending on the statement).
export const exec = async (
  sql: string,
  replacements: Record<string, unknown> = {},
): Promise<void> => {
  await sequelize.query(sql, { replacements });
};

/** Statement runners handed to an `inTransaction` callback. */
export type TxRun = (
  sql: string,
  replacements?: Record<string, unknown>,
) => Promise<void>;

export type TxSelect = <R>(
  sql: string,
  replacements?: Record<string, unknown>,
) => Promise<R[]>;

/**
 * Run several statements atomically — used by every status transition.
 *
 * The transition reads the current status, writes the new one, appends an audit
 * row and stamps the ops row. Those four must land together: an audit trail
 * with a missing entry is worse than no audit trail, because it is trusted.
 */
export const inTransaction = async <T>(
  fn: (run: TxRun, select: TxSelect) => Promise<T>,
): Promise<T> =>
  sequelize.transaction(async (transaction) => {
    const run: TxRun = async (sql, replacements = {}) => {
      await sequelize.query(sql, { replacements, transaction });
    };
    const select: TxSelect = async <R,>(sql: string, replacements = {}) =>
      (await sequelize.query(sql, {
        replacements,
        transaction,
        type: QueryTypes.SELECT,
      })) as unknown as R[];
    return fn(run, select);
  });

// ── Small shared shapes ─────────────────────────────────────────────────────

/** The internal operator making a change, taken from the verified session. */
export interface Actor {
  userId: number | string;
  email?: string | null;
}

export interface Paged<T> {
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
}

export const clampPage = (page?: number): number =>
  Math.max(1, Math.floor(Number(page) || 1));

export const clampPageSize = (size?: number, fallback = 50): number =>
  Math.min(200, Math.max(1, Math.floor(Number(size) || fallback)));

/** Whole days between `from` and now, floored. Null when `from` is missing. */
export const daysSince = (from: Date | string | null): number | null => {
  if (!from) return null;
  const then = from instanceof Date ? from.getTime() : Date.parse(String(from));
  if (Number.isNaN(then)) return null;
  return Math.floor((Date.now() - then) / 86_400_000);
};
