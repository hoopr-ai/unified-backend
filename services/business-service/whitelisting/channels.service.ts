// ─── Channel Whitelisting — the ops queue ────────────────────────────────────
//
// One row per channel a creator submitted for clearance, newest first, joined to
// the subscription that entitles them to it. This replaces the hand-run
// spreadsheet export (whitelist_subscribed_users_prod.xlsx) that ops was
// working from, and adds the two things a spreadsheet cannot have: a status you
// can change from the same screen, and a record of who changed it.
//
// COHORT. The manager's definition: "whoever took a subscription sends their
// channel in this list". So the queue is submitted channels belonging to users
// who have at least one user_subscriptions row of any status, and the row then
// says whether that subscription is live right now. Cancelled subscribers stay
// visible on purpose — a channel submitted while paying does not stop being our
// problem the day the card fails, and hiding them is how a queue silently loses
// rows.
//
// "Submitted" is whitelistStatus IS NOT NULL. NULL means the creator connected
// the channel but never pressed submit, which is not an ops task. Same cohort
// rule as the spreadsheet, so the two agree row for row.
//
// SOURCE OF TRUTH. soundtracking_user_profiles."whitelistStatus" is written by
// three places now: the creator (NATIVE-BE + content-recommendation, not_sent →
// sent) and this CMS (the terminal transitions). The vocabulary is shared and
// 'not_sent' is stored as NULL — see whitelisting-shared.ts.
//
// NOT THE SAME COLUMN as the legacy surface. internal-fe still has a
// YoutubeWhitelistPage under /creator/hoopr-app, which reads and writes
// users."youtubeWhitelistStatus" through content-recommendation's
// /smash/st/youtube-whitelist. That column is per-USER, YouTube-only, and is set
// for exactly ONE user in prod; the Python module that owns it says so itself,
// and the per-profile column here is the source of truth going forward. The two
// do not sync, so a channel cleared here will not change anything on that page
// — the legacy surface should be retired rather than kept in parallel.

import { AppError } from "../../helper-service/AppError";
import {
  ALLOWLIST_STATE_LABELS,
  providerFor,
  providerOptionsFor,
  type AllowlistProvider,
  type AllowlistState,
} from "./allowlist.provider";
import { notifyChannel } from "./notify.service";
import {
  CHANNEL_SOURCES,
  LIVE_SUB_STATUSES,
  ORIGINS,
  ORIGIN_LABELS,
  WHITELIST_STATUSES,
  WHITELIST_STATUS_LABELS,
  clampPage,
  clampPageSize,
  daysSince,
  exec,
  inTransaction,
  num,
  originExpr,
  q,
  type Actor,
  type ChannelSource,
  type Origin,
  type Paged,
  type WhitelistStatus,
} from "./whitelisting-shared";

// ── Filters ─────────────────────────────────────────────────────────────────

export interface ChannelFilters {
  status?: WhitelistStatus | null;
  source?: ChannelSource | null;
  origin?: Origin | null;
  /** 'active' → live subscription right now; 'inactive' → had one, not now. */
  subscription?: "active" | "inactive" | null;
  allowlistState?: AllowlistState | null;
  /** Free text over name, email, mobile, channel handle and channel id. */
  search?: string | null;
  /** Only rows waiting this many days or more. Drives the SLA view. */
  minAgeDays?: number | null;
  /**
   * Submission-date window, inclusive, as **IST calendar days** (YYYY-MM-DD).
   * Either end may stand alone. See the WHERE below for the boundary maths.
   */
  startDate?: string | null;
  endDate?: string | null;
  page?: number;
  pageSize?: number;
  sortBy?: "submittedAt" | "connectedAt" | "audience" | "subscribedAt";
  sortDir?: "asc" | "desc";
}

export interface ChannelRow {
  profileId: number;
  userId: string;
  name: string | null;
  email: string | null;
  mobile: string | null;
  city: string | null;
  country: string | null;
  origin: Origin;
  originLabel: string;
  source: ChannelSource;
  handle: string | null;
  identifier: string | null;
  channelUrl: string | null;
  audience: number | null;
  verified: boolean;
  status: WhitelistStatus;
  statusLabel: string;
  submittedAt: string | null;
  connectedAt: string | null;
  /** Whole days since submission, for rows still awaiting review. */
  ageDays: number | null;
  allowlistState: AllowlistState;
  allowlistStateLabel: string;
  allowlistProvider: string | null;
  allowlistRef: string | null;
  allowlistAt: string | null;
  notifiedAt: string | null;
  lastActionBy: string | null;
  lastActionAt: string | null;
  subscription: {
    id: string | null;
    planCode: string | null;
    planName: string | null;
    status: string | null;
    isLive: boolean;
    paymentProvider: string | null;
    currentPeriodEnd: string | null;
    subscribedAt: string | null;
    channelsAllowed: number | null;
  };
}

// ORDER BY is not parameterisable, so the column comes from a closed map and
// never from the request string.
const SORTABLE: Record<string, string> = {
  submittedAt: 'p."whitelistUpdatedAt"',
  connectedAt: 'p."createdAt"',
  audience: 'COALESCE(p."youtubeSubscribers", p.followers, 0)',
  subscribedAt: 's."createdAt"',
};

const CHANNEL_URL: Record<ChannelSource, (handle: string | null, id: string | null) => string | null> = {
  youtube: (handle, id) =>
    handle ? `https://youtube.com/@${handle}` : id ? `https://youtube.com/channel/${id}` : null,
  instagram: (handle) => (handle ? `https://instagram.com/${handle}` : null),
  facebook: (handle, id) =>
    handle ? `https://facebook.com/${handle}` : id ? `https://facebook.com/${id}` : null,
};

const iso = (v: unknown): string | null =>
  v instanceof Date ? v.toISOString() : ((v as string | null) ?? null);

const fullName = (first: unknown, last: unknown): string | null => {
  const name = [first, last].filter(Boolean).join(" ").trim();
  return name || null;
};

// Every predicate is written as `(CAST(:x AS ...) IS NULL OR …)` so there is
// exactly ONE sql string per endpoint regardless of which filters are set. A
// query assembled from fragments is far harder to audit, and this one decides
// what ops does and does not see.
const WHERE = `
  WHERE p."whitelistStatus" IS NOT NULL
    AND EXISTS (SELECT 1 FROM user_subscriptions _any WHERE _any."userId" = u.id)
    AND (CAST(:status AS text) IS NULL OR p."whitelistStatus" = :status)
    AND (CAST(:source AS text) IS NULL OR p.source = :source)
    AND (CAST(:allowlistState AS text) IS NULL
         OR COALESCE(o."allowlistState", 'NOT_STARTED') = :allowlistState)
    AND (CAST(:subscription AS text) IS NULL
         OR (:subscription = 'active'   AND s.id IS NOT NULL)
         OR (:subscription = 'inactive' AND s.id IS NULL))
    AND (CAST(:minAgeDays AS int) IS NULL
         OR p."whitelistUpdatedAt" <= now() - (:minAgeDays * INTERVAL '1 day'))
    -- Submission window, in IST. The dates arrive as Asia/Kolkata calendar days
    -- and are widened to instants here: start-of-day on :startDate, and the
    -- start of the day AFTER :endDate as an exclusive upper bound. Half-open
    -- rather than a plain "<= endDate": "whitelistUpdatedAt" is a timestamptz,
    -- and a <= against midnight would drop every row submitted during
    -- the operator's last chosen day, which is the day they most care about.
    AND (CAST(:startDate AS text) IS NULL
         OR p."whitelistUpdatedAt" >= ((:startDate)::date)::timestamp AT TIME ZONE 'Asia/Kolkata')
    AND (CAST(:endDate AS text) IS NULL
         OR p."whitelistUpdatedAt" < ((:endDate)::date + 1)::timestamp AT TIME ZONE 'Asia/Kolkata')
    AND (CAST(:search AS text) IS NULL
         OR u.email ILIKE :searchLike
         OR u.mobile ILIKE :searchLike
         OR COALESCE(u."firstName",'') || ' ' || COALESCE(u."lastName",'') ILIKE :searchLike
         OR COALESCE(p."platformHandle", p."youtubeHandle",'') ILIKE :searchLike
         OR COALESCE(p."youtubeChannelId", p."instagramId", p."facebookPageId",'') ILIKE :searchLike)`;

// The operative subscription: newest LIVE one. A LATERAL rather than a plain
// join so a user with years of subscription history still yields exactly one
// line per channel — the spreadsheet's "operative subscription" rule, kept.
const LIVE_SUB = `
  LEFT JOIN LATERAL (
    SELECT id, "planCode", status, "currentPeriodEnd", "paymentProvider", "createdAt"
      FROM user_subscriptions
     WHERE "userId" = u.id
       AND status IN ('${LIVE_SUB_STATUSES.join("','")}')
     ORDER BY "createdAt" DESC
     LIMIT 1
  ) s ON TRUE`;

// Falls back to the newest subscription of ANY status, so a churned subscriber
// still shows what they were on rather than an empty column.
const ANY_SUB = `
  LEFT JOIN LATERAL (
    SELECT id, "planCode", status, "currentPeriodEnd", "paymentProvider", "createdAt"
      FROM user_subscriptions
     WHERE "userId" = u.id
     ORDER BY "createdAt" DESC
     LIMIT 1
  ) s_any ON TRUE`;

const OPS = `LEFT JOIN channel_whitelist_ops o ON o."profileId" = p.id`;

// Most recent audit entry, for the "who last touched this" column.
const LAST_ACTION = `
  LEFT JOIN LATERAL (
    SELECT "actorEmail", "createdAt"
      FROM whitelist_audit
     WHERE "entityType" = 'CHANNEL' AND "entityId" = p.id::text
     ORDER BY "createdAt" DESC
     LIMIT 1
  ) a ON TRUE`;

const binds = (f: ChannelFilters) => ({
  status: f.status ?? null,
  source: f.source ?? null,
  origin: f.origin ?? null,
  subscription: f.subscription ?? null,
  allowlistState: f.allowlistState ?? null,
  minAgeDays: f.minAgeDays ?? null,
  startDate: f.startDate || null,
  endDate: f.endDate || null,
  search: f.search?.trim() || null,
  searchLike: f.search?.trim() ? `%${f.search.trim()}%` : null,
});

/**
 * The queue. Newest submission first by default — the manager asked for
 * date-sorted, latest first, and that is what an ops queue reads best as.
 *
 * The origin filter is applied OUTSIDE the joins, against the derived
 * expression, because it is a CASE over three EXISTS arms and Postgres cannot
 * use it in a WHERE without recomputing it per predicate.
 */
export const listChannelsService = async (
  f: ChannelFilters,
): Promise<Paged<ChannelRow>> => {
  const page = clampPage(f.page);
  const pageSize = clampPageSize(f.pageSize);
  const order = `${SORTABLE[f.sortBy ?? "submittedAt"] ?? SORTABLE.submittedAt} ${
    f.sortDir === "asc" ? "ASC" : "DESC"
  } NULLS LAST`;
  const origin = await originExpr("u");
  const originFilter = `AND (CAST(:origin AS text) IS NULL OR origin = :origin)`;

  // The derived origin is computed once in an inner select and filtered in the
  // outer one, so each row evaluates the CASE exactly once.
  const inner = `
    SELECT p.id AS "profileId", u.id::text AS "userId",
           u."firstName", u."lastName", u.email, u.mobile, u.city, u.country,
           p.source,
           COALESCE(p."platformHandle", p."youtubeHandle") AS handle,
           COALESCE(p."youtubeChannelId", p."instagramId", p."facebookPageId") AS identifier,
           COALESCE(p."youtubeSubscribers", p.followers) AS audience,
           COALESCE(p."youtubeVerified", p."instaVerified", false) AS verified,
           p."whitelistStatus" AS status,
           p."whitelistUpdatedAt" AS "submittedAt",
           p."createdAt" AS "connectedAt",
           COALESCE(o."allowlistState", 'NOT_STARTED') AS "allowlistState",
           o."allowlistProvider", o."allowlistRef", o."allowlistAt", o."notifiedAt",
           a."actorEmail" AS "lastActionBy", a."createdAt" AS "lastActionAt",
           COALESCE(s.id, s_any.id)::text                AS "subId",
           COALESCE(s."planCode", s_any."planCode")      AS "subPlanCode",
           COALESCE(s.status, s_any.status)              AS "subStatus",
           (s.id IS NOT NULL)                            AS "subIsLive",
           COALESCE(s."paymentProvider", s_any."paymentProvider") AS "subProvider",
           COALESCE(s."currentPeriodEnd", s_any."currentPeriodEnd")AS "subPeriodEnd",
           COALESCE(s."createdAt", s_any."createdAt")    AS "subCreatedAt",
           pl.name AS "planName", pl."includedChannelsPerPlatform" AS "channelsAllowed",
           ${origin} AS origin,
           ${SORTABLE[f.sortBy ?? "submittedAt"] ?? SORTABLE.submittedAt} AS sort_key
      FROM soundtracking_user_profiles p
      JOIN users u ON u.id = p."userId"
      ${LIVE_SUB}
      ${ANY_SUB}
      LEFT JOIN subscription_plans pl
             ON pl.code = COALESCE(s."planCode", s_any."planCode")
      ${OPS}
      ${LAST_ACTION}
      ${WHERE}`;

  const [countRow] = await q<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM (${inner}) t WHERE TRUE ${originFilter}`,
    binds(f),
  );

  const rows = await q<Record<string, unknown>>(
    `SELECT * FROM (${inner}) t
      WHERE TRUE ${originFilter}
      ORDER BY sort_key ${f.sortDir === "asc" ? "ASC" : "DESC"} NULLS LAST, "profileId" DESC
      LIMIT :pageSize OFFSET :offset`,
    { ...binds(f), pageSize, offset: (page - 1) * pageSize },
  );

  return {
    rows: rows.map(toChannelRow),
    total: num(countRow?.n),
    page,
    pageSize,
  };
};

const toChannelRow = (r: Record<string, unknown>): ChannelRow => {
  const source = r.source as ChannelSource;
  const handle = (r.handle as string | null) ?? null;
  const identifier = (r.identifier as string | null) ?? null;
  const status = (r.status as WhitelistStatus) ?? "not_sent";
  const origin = (r.origin as Origin) ?? "WEB";
  const allowlistState = (r.allowlistState as AllowlistState) ?? "NOT_STARTED";

  return {
    profileId: Number(r.profileId),
    userId: String(r.userId),
    name: fullName(r.firstName, r.lastName),
    email: (r.email as string | null) ?? null,
    mobile: (r.mobile as string | null) ?? null,
    city: (r.city as string | null) ?? null,
    country: (r.country as string | null) ?? null,
    origin,
    originLabel: ORIGIN_LABELS[origin] ?? origin,
    source,
    handle,
    identifier,
    channelUrl: CHANNEL_URL[source]?.(handle, identifier) ?? null,
    audience: r.audience === null || r.audience === undefined ? null : Number(r.audience),
    verified: Boolean(r.verified),
    status,
    statusLabel: WHITELIST_STATUS_LABELS[status] ?? status,
    submittedAt: iso(r.submittedAt),
    connectedAt: iso(r.connectedAt),
    // Ageing is only meaningful while a row is still waiting on us. A decided
    // channel showing "42 days old" would read as an open breach forever.
    ageDays: status === "sent" ? daysSince(r.submittedAt as Date | null) : null,
    allowlistState,
    allowlistStateLabel: ALLOWLIST_STATE_LABELS[allowlistState] ?? allowlistState,
    allowlistProvider: (r.allowlistProvider as string | null) ?? null,
    allowlistRef: (r.allowlistRef as string | null) ?? null,
    allowlistAt: iso(r.allowlistAt),
    notifiedAt: iso(r.notifiedAt),
    lastActionBy: (r.lastActionBy as string | null) ?? null,
    lastActionAt: iso(r.lastActionAt),
    subscription: {
      id: (r.subId as string | null) ?? null,
      planCode: (r.subPlanCode as string | null) ?? null,
      planName: (r.planName as string | null) ?? null,
      status: (r.subStatus as string | null) ?? null,
      isLive: Boolean(r.subIsLive),
      paymentProvider: (r.subProvider as string | null) ?? null,
      currentPeriodEnd: iso(r.subPeriodEnd),
      subscribedAt: iso(r.subCreatedAt),
      channelsAllowed:
        r.channelsAllowed === null || r.channelsAllowed === undefined
          ? null
          : Number(r.channelsAllowed),
    },
  };
};

// ── Meta: dropdown vocabulary + the numbers the header tiles show ───────────

export const channelsMetaService = async () => {
  const origin = await originExpr("u");

  const [counts] = await q<Record<string, number>>(
    `SELECT
       COUNT(*) FILTER (WHERE p."whitelistStatus" = 'sent')::int        AS pending,
       COUNT(*) FILTER (WHERE p."whitelistStatus" = 'whitelisted')::int AS whitelisted,
       COUNT(*) FILTER (WHERE p."whitelistStatus" = 'rejected')::int    AS rejected,
       COUNT(*)::int                                                    AS total,
       COUNT(*) FILTER (WHERE p."whitelistStatus" = 'sent'
                          AND p."whitelistUpdatedAt" <= now() - INTERVAL '3 days')::int  AS ageing,
       COUNT(*) FILTER (WHERE p."whitelistStatus" = 'sent'
                          AND p."whitelistUpdatedAt" <= now() - INTERVAL '7 days')::int  AS breached,
       -- Decided but never pushed to the platform: our books say cleared while
       -- the creator's videos are still being claimed. The tile that matters.
       COUNT(*) FILTER (WHERE p."whitelistStatus" = 'whitelisted'
                          AND COALESCE(o."allowlistState",'NOT_STARTED')
                              NOT IN ('CONFIRMED','NOT_REQUIRED'))::int AS "awaitingPlatform"
     FROM soundtracking_user_profiles p
     JOIN users u ON u.id = p."userId"
     ${OPS}
     WHERE p."whitelistStatus" IS NOT NULL
       AND EXISTS (SELECT 1 FROM user_subscriptions _any WHERE _any."userId" = u.id)`,
  );

  const bySource = await q<{ source: string; n: number }>(
    `SELECT p.source, COUNT(*)::int AS n
       FROM soundtracking_user_profiles p
       JOIN users u ON u.id = p."userId"
      WHERE p."whitelistStatus" IS NOT NULL
        AND EXISTS (SELECT 1 FROM user_subscriptions _any WHERE _any."userId" = u.id)
      GROUP BY p.source`,
  );

  const byOrigin = await q<{ origin: string; n: number }>(
    `SELECT origin, COUNT(*)::int AS n FROM (
       SELECT ${origin} AS origin
         FROM soundtracking_user_profiles p
         JOIN users u ON u.id = p."userId"
        WHERE p."whitelistStatus" IS NOT NULL
          AND EXISTS (SELECT 1 FROM user_subscriptions _any WHERE _any."userId" = u.id)
     ) t GROUP BY origin`,
  );

  return {
    statuses: WHITELIST_STATUSES.map((value) => ({
      value,
      label: WHITELIST_STATUS_LABELS[value],
    })),
    sources: CHANNEL_SOURCES,
    origins: ORIGINS.map((value) => ({ value, label: ORIGIN_LABELS[value] })),
    allowlistStates: Object.entries(ALLOWLIST_STATE_LABELS).map(([value, label]) => ({
      value,
      label,
    })),
    // Availability is read from the drivers, so the UI never hard-codes an
    // assumption about which platform APIs this server can actually reach.
    providers: Object.fromEntries(
      CHANNEL_SOURCES.map((s) => [s, providerOptionsFor(s)]),
    ),
    counts: {
      total: num(counts?.total),
      pending: num(counts?.pending),
      whitelisted: num(counts?.whitelisted),
      rejected: num(counts?.rejected),
      ageing: num(counts?.ageing),
      breached: num(counts?.breached),
      awaitingPlatform: num(counts?.awaitingPlatform),
    },
    bySource: Object.fromEntries(bySource.map((r) => [r.source, num(r.n)])),
    byOrigin: Object.fromEntries(byOrigin.map((r) => [r.origin, num(r.n)])),
    /** Days-since-submission thresholds the UI colours rows against. */
    sla: { ageingAfterDays: 3, breachedAfterDays: 7 },
  };
};

// ── Transition ──────────────────────────────────────────────────────────────

export interface UpdateChannelInput {
  status: WhitelistStatus;
  /** Required on a rejection — a creator is owed the reason, and gets mailed it. */
  note?: string | null;
  /** Push the channel to its platform as part of this change. */
  allowlist?: {
    provider?: AllowlistProvider;
    /** Evidence for a manual push: the Studio/Rights Manager entry, a ticket id. */
    reference?: string | null;
  } | null;
  /** Suppress the creator email for this one change (bulk backfills, tests). */
  skipNotify?: boolean;
}

/**
 * Move one channel's clearance status.
 *
 * Four things happen atomically: the profile row is updated, the audit row is
 * appended, the ops row is upserted, and — when asked — the platform push is
 * recorded. Notification is sent AFTER the transaction commits and is
 * best-effort: an operator's decision must never be rolled back because SMTP
 * was unreachable.
 */
export const updateChannelStatusService = async (
  profileId: number,
  input: UpdateChannelInput,
  actor: Actor,
): Promise<ChannelRow> => {
  const note = input.note?.trim() || null;
  if (input.status === "rejected" && !note) {
    throw new AppError("A reason is required when rejecting a channel.", 400);
  }

  const outcome = await inTransaction(async (run, select) => {
    // FOR UPDATE: two operators triaging the same queue must not interleave a
    // read of the old status with each other's write, or the audit trail records
    // a transition that never happened.
    const [row] = await select<{
      id: number;
      userId: string;
      source: ChannelSource;
      handle: string | null;
      identifier: string | null;
      whitelistStatus: WhitelistStatus | null;
    }>(
      `SELECT p.id, p."userId"::text AS "userId", p.source,
              COALESCE(p."platformHandle", p."youtubeHandle") AS handle,
              COALESCE(p."youtubeChannelId", p."instagramId", p."facebookPageId") AS identifier,
              p."whitelistStatus"
         FROM soundtracking_user_profiles p
        WHERE p.id = :profileId
        FOR UPDATE`,
      { profileId },
    );
    if (!row) throw new AppError("No such channel.", 404);

    const from = row.whitelistStatus ?? "not_sent";

    // 'not_sent' is stored as NULL so COALESCE reads stay consistent with rows
    // that were never touched — the Python admin layer's rule, kept byte for
    // byte, because both write this column.
    await run(
      `UPDATE soundtracking_user_profiles
          SET "whitelistStatus"    = :stored,
              "whitelistUpdatedAt" = now()
        WHERE id = :profileId`,
      {
        profileId,
        stored: input.status === "not_sent" ? null : input.status,
      },
    );

    await run(
      `INSERT INTO whitelist_audit
         ("entityType","entityId","fromStatus","toStatus",note,"actorUserId","actorEmail")
       VALUES ('CHANNEL', :entityId, :fromStatus, :toStatus, :note, :actorUserId, :actorEmail)`,
      {
        entityId: String(profileId),
        fromStatus: from,
        toStatus: input.status,
        note,
        actorUserId: actor.userId ?? null,
        actorEmail: actor.email ?? null,
      },
    );

    let allowlist: {
      state: AllowlistState;
      provider: AllowlistProvider;
      reference: string | null;
      error: string | null;
    } | null = null;

    if (input.allowlist) {
      const driver = providerFor(row.source, input.allowlist.provider ?? "manual");
      allowlist = await driver.push({
        profileId,
        source: row.source,
        identifier: row.identifier,
        handle: row.handle,
        reference: input.allowlist.reference ?? null,
      });
    } else if (input.status === "rejected") {
      // A rejected channel is never going to the platform. Saying so explicitly
      // keeps it out of the "decided but not pushed" tile, which would otherwise
      // fill with rows nobody should act on.
      allowlist = {
        state: "NOT_REQUIRED",
        provider: "manual",
        reference: null,
        error: null,
      };
    }

    await run(
      `INSERT INTO channel_whitelist_ops
         ("profileId","allowlistState","allowlistProvider","allowlistRef",
          "allowlistError","allowlistAt","allowlistBy","updatedAt")
       VALUES (:profileId,
               COALESCE(:state,'NOT_STARTED'), :provider, :reference,
               :error, CASE WHEN :state IS NULL THEN NULL ELSE now() END,
               :actorUserId, now())
       ON CONFLICT ("profileId") DO UPDATE SET
         "allowlistState"    = COALESCE(EXCLUDED."allowlistState", channel_whitelist_ops."allowlistState"),
         "allowlistProvider" = COALESCE(EXCLUDED."allowlistProvider", channel_whitelist_ops."allowlistProvider"),
         "allowlistRef"      = COALESCE(EXCLUDED."allowlistRef", channel_whitelist_ops."allowlistRef"),
         "allowlistError"    = EXCLUDED."allowlistError",
         "allowlistAt"       = COALESCE(EXCLUDED."allowlistAt", channel_whitelist_ops."allowlistAt"),
         "allowlistBy"       = COALESCE(EXCLUDED."allowlistBy", channel_whitelist_ops."allowlistBy"),
         "updatedAt"         = now()`,
      {
        profileId,
        state: allowlist?.state ?? null,
        provider: allowlist?.provider ?? null,
        reference: allowlist?.reference ?? null,
        error: allowlist?.error ?? null,
        actorUserId: actor.userId ?? null,
      },
    );

    const [contact] = await select<{
      email: string | null;
      firstName: string | null;
      notifiedStatus: string | null;
    }>(
      `SELECT u.email, u."firstName", o."notifiedStatus"
         FROM users u
         LEFT JOIN channel_whitelist_ops o ON o."profileId" = :profileId
        WHERE u.id = :userId`,
      { profileId, userId: row.userId },
    );

    return { row, from, contact, allowlistError: allowlist?.error ?? null };
  });

  // ── After commit ──────────────────────────────────────────────────────────
  //
  // De-dup on the outcome, not on a boolean: whitelisted → rejected →
  // whitelisted must mail each real change, but re-saving the same status must
  // not mail twice.
  const alreadyTold = outcome.contact?.notifiedStatus === input.status;
  if (!input.skipNotify && !alreadyTold) {
    const sent = await notifyChannel({
      email: outcome.contact?.email ?? null,
      firstName: outcome.contact?.firstName ?? null,
      source: outcome.row.source,
      handle: outcome.row.handle,
      status: input.status,
      note,
    });
    if (sent) {
      await exec(
        `INSERT INTO channel_whitelist_ops ("profileId","notifiedStatus","notifiedAt","updatedAt")
         VALUES (:profileId, :status, now(), now())
         ON CONFLICT ("profileId") DO UPDATE SET
           "notifiedStatus" = EXCLUDED."notifiedStatus",
           "notifiedAt"     = EXCLUDED."notifiedAt",
           "updatedAt"      = now()`,
        { profileId, status: input.status },
      );
    }
  }

  const { rows } = await listOneChannel(profileId);
  if (!rows.length) throw new AppError("No such channel.", 404);
  return rows[0];
};

/** Re-read one row through the list projection, so the API returns one shape. */
const listOneChannel = async (profileId: number): Promise<Paged<ChannelRow>> => {
  const origin = await originExpr("u");
  const rows = await q<Record<string, unknown>>(
    `SELECT p.id AS "profileId", u.id::text AS "userId",
            u."firstName", u."lastName", u.email, u.mobile, u.city, u.country,
            p.source,
            COALESCE(p."platformHandle", p."youtubeHandle") AS handle,
            COALESCE(p."youtubeChannelId", p."instagramId", p."facebookPageId") AS identifier,
            COALESCE(p."youtubeSubscribers", p.followers) AS audience,
            COALESCE(p."youtubeVerified", p."instaVerified", false) AS verified,
            COALESCE(p."whitelistStatus",'not_sent') AS status,
            p."whitelistUpdatedAt" AS "submittedAt", p."createdAt" AS "connectedAt",
            COALESCE(o."allowlistState",'NOT_STARTED') AS "allowlistState",
            o."allowlistProvider", o."allowlistRef", o."allowlistAt", o."notifiedAt",
            a."actorEmail" AS "lastActionBy", a."createdAt" AS "lastActionAt",
            COALESCE(s.id, s_any.id)::text                 AS "subId",
            COALESCE(s."planCode", s_any."planCode")       AS "subPlanCode",
            COALESCE(s.status, s_any.status)               AS "subStatus",
            (s.id IS NOT NULL)                             AS "subIsLive",
            COALESCE(s."paymentProvider", s_any."paymentProvider")  AS "subProvider",
            COALESCE(s."currentPeriodEnd", s_any."currentPeriodEnd")AS "subPeriodEnd",
            COALESCE(s."createdAt", s_any."createdAt")     AS "subCreatedAt",
            pl.name AS "planName", pl."includedChannelsPerPlatform" AS "channelsAllowed",
            ${origin} AS origin
       FROM soundtracking_user_profiles p
       JOIN users u ON u.id = p."userId"
       ${LIVE_SUB}
       ${ANY_SUB}
       LEFT JOIN subscription_plans pl
              ON pl.code = COALESCE(s."planCode", s_any."planCode")
       ${OPS}
       ${LAST_ACTION}
      WHERE p.id = :profileId`,
    { profileId },
  );
  return { rows: rows.map(toChannelRow), total: rows.length, page: 1, pageSize: 1 };
};

export const getChannelService = async (profileId: number): Promise<ChannelRow> => {
  const { rows } = await listOneChannel(profileId);
  if (!rows.length) throw new AppError("No such channel.", 404);
  return rows[0];
};

// ── History ─────────────────────────────────────────────────────────────────

export interface AuditEntry {
  id: string;
  fromStatus: string | null;
  toStatus: string;
  note: string | null;
  actorEmail: string | null;
  createdAt: string | null;
}

export const channelHistoryService = async (
  profileId: number,
): Promise<AuditEntry[]> => {
  const rows = await q<Record<string, unknown>>(
    `SELECT id::text AS id, "fromStatus", "toStatus", note, "actorEmail", "createdAt"
       FROM whitelist_audit
      WHERE "entityType" = 'CHANNEL' AND "entityId" = :entityId
      ORDER BY "createdAt" DESC, id DESC`,
    { entityId: String(profileId) },
  );
  return rows.map((r) => ({
    id: String(r.id),
    fromStatus: (r.fromStatus as string | null) ?? null,
    toStatus: String(r.toStatus),
    note: (r.note as string | null) ?? null,
    actorEmail: (r.actorEmail as string | null) ?? null,
    createdAt: iso(r.createdAt),
  }));
};
