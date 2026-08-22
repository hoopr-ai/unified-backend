// ─── Claim Clearance — the ops queue ─────────────────────────────────────────
//
// A creator pastes the URL of a video carrying a copyright claim and asks us to
// release it. Rows arrive in `claims`, a table NATIVE-BE owns outright
// (modules/claims/entities/native-claim.entity.ts).
//
// This CMS reads and triages: PENDING → IN_REVIEW → RESOLVED | REJECTED. There
// is no create and no delete here, and that is deliberate — rows come from
// creators, and a claim we cannot honour is marked REJECTED rather than
// removed. The creator asked, and "we looked and said no" is an answer they are
// owed. Same rule NATIVE-BE's own admin controller states.
//
// Column names follow the entity, not the older FE integration note: the row is
// (userId, email, mobile, videoUrl, platform, status).

import { AppError } from "../../helper-service/AppError";
import { claimNotifiable, notifyClaim } from "./notify.service";
import {
  CLAIM_STATUSES,
  CLAIM_STATUS_LABELS,
  ORIGINS,
  ORIGIN_LABELS,
  VIDEO_PLATFORMS,
  clampPage,
  clampPageSize,
  daysSince,
  exec,
  inTransaction,
  num,
  originExpr,
  q,
  type Actor,
  type ClaimStatus,
  type Origin,
  type Paged,
  type VideoPlatform,
} from "./whitelisting-shared";
import type { AuditEntry } from "./channels.service";

export interface ClaimFilters {
  status?: ClaimStatus | null;
  platform?: VideoPlatform | null;
  origin?: Origin | null;
  subscription?: "active" | "inactive" | null;
  /** Free text over email, mobile, video URL and creator name. */
  search?: string | null;
  minAgeDays?: number | null;
  page?: number;
  pageSize?: number;
  sortBy?: "createdAt" | "updatedAt";
  sortDir?: "asc" | "desc";
}

export interface ClaimRow {
  id: string;
  userId: string | null;
  name: string | null;
  /** The reply address given on the claim, which may differ from the account's. */
  email: string | null;
  accountEmail: string | null;
  mobile: string | null;
  videoUrl: string;
  platform: VideoPlatform;
  status: ClaimStatus;
  statusLabel: string;
  origin: Origin;
  originLabel: string;
  submittedAt: string | null;
  updatedAt: string | null;
  /** Days waiting. Null once the claim is decided — see the note in channels. */
  ageDays: number | null;
  notifiedAt: string | null;
  lastActionBy: string | null;
  lastActionAt: string | null;
  lastNote: string | null;
  subscription: {
    planCode: string | null;
    planName: string | null;
    status: string | null;
    isLive: boolean;
  };
}

const SORTABLE: Record<string, string> = {
  createdAt: 'c."createdAt"',
  updatedAt: 'c."updatedAt"',
};

const iso = (v: unknown): string | null =>
  v instanceof Date ? v.toISOString() : ((v as string | null) ?? null);

const fullName = (first: unknown, last: unknown): string | null => {
  const name = [first, last].filter(Boolean).join(" ").trim();
  return name || null;
};

// LEFT JOIN on users, not an inner one: NATIVE-BE's claims route allows an
// anonymous filing, and a claim with no account attached is still a claim
// somebody is waiting on. Dropping those rows would hide real work.
const JOINS = `
  FROM claims c
  LEFT JOIN users u ON u.id = c."userId"
  LEFT JOIN LATERAL (
    SELECT "planCode", status
      FROM user_subscriptions
     WHERE "userId" = c."userId"
       AND status IN ('active','past_due')
     ORDER BY "createdAt" DESC
     LIMIT 1
  ) s ON TRUE
  LEFT JOIN LATERAL (
    SELECT "planCode", status
      FROM user_subscriptions
     WHERE "userId" = c."userId"
     ORDER BY "createdAt" DESC
     LIMIT 1
  ) s_any ON TRUE
  LEFT JOIN subscription_plans pl
         ON pl.code = COALESCE(s."planCode", s_any."planCode")
  LEFT JOIN claim_ops o ON o."claimId" = c.id
  LEFT JOIN LATERAL (
    SELECT "actorEmail", "createdAt", note
      FROM whitelist_audit
     WHERE "entityType" = 'CLAIM' AND "entityId" = c.id::text
     ORDER BY "createdAt" DESC
     LIMIT 1
  ) a ON TRUE`;

const WHERE = `
  WHERE (CAST(:status AS text) IS NULL OR c.status = :status)
    AND (CAST(:platform AS text) IS NULL OR c.platform = :platform)
    AND (CAST(:subscription AS text) IS NULL
         OR (:subscription = 'active'   AND s."planCode" IS NOT NULL)
         OR (:subscription = 'inactive' AND s."planCode" IS NULL))
    AND (CAST(:minAgeDays AS int) IS NULL
         OR c."createdAt" <= now() - (:minAgeDays * INTERVAL '1 day'))
    AND (CAST(:search AS text) IS NULL
         OR c.email ILIKE :searchLike
         OR c.mobile ILIKE :searchLike
         OR c."videoUrl" ILIKE :searchLike
         OR COALESCE(u."firstName",'') || ' ' || COALESCE(u."lastName",'') ILIKE :searchLike
         OR COALESCE(u.email,'') ILIKE :searchLike)`;

const binds = (f: ClaimFilters) => ({
  status: f.status ?? null,
  platform: f.platform ?? null,
  origin: f.origin ?? null,
  subscription: f.subscription ?? null,
  minAgeDays: f.minAgeDays ?? null,
  search: f.search?.trim() || null,
  searchLike: f.search?.trim() ? `%${f.search.trim()}%` : null,
});

export const listClaimsService = async (
  f: ClaimFilters,
): Promise<Paged<ClaimRow>> => {
  const page = clampPage(f.page);
  const pageSize = clampPageSize(f.pageSize);
  const sortCol = SORTABLE[f.sortBy ?? "createdAt"] ?? SORTABLE.createdAt;
  const dir = f.sortDir === "asc" ? "ASC" : "DESC";
  const origin = await originExpr("u");

  // A claim filed anonymously has no user to derive an origin from. It reports
  // WEB rather than inventing a fourth value — the form only exists on web and
  // in-app surfaces that would have carried a token.
  const inner = `
    SELECT c.id::text AS id, c."userId"::text AS "userId",
           u."firstName", u."lastName", u.email AS "accountEmail",
           c.email, c.mobile, c."videoUrl", c.platform, c.status,
           c."createdAt" AS "submittedAt", c."updatedAt",
           o."notifiedAt",
           a."actorEmail" AS "lastActionBy", a."createdAt" AS "lastActionAt", a.note AS "lastNote",
           COALESCE(s."planCode", s_any."planCode") AS "subPlanCode",
           COALESCE(s.status, s_any.status)         AS "subStatus",
           (s."planCode" IS NOT NULL)               AS "subIsLive",
           pl.name AS "planName",
           CASE WHEN u.id IS NULL THEN 'WEB' ELSE ${origin} END AS origin,
           ${sortCol} AS sort_key
    ${JOINS}
    ${WHERE}`;

  const originFilter = `AND (CAST(:origin AS text) IS NULL OR origin = :origin)`;

  const [countRow] = await q<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM (${inner}) t WHERE TRUE ${originFilter}`,
    binds(f),
  );

  const rows = await q<Record<string, unknown>>(
    `SELECT * FROM (${inner}) t
      WHERE TRUE ${originFilter}
      ORDER BY sort_key ${dir} NULLS LAST, id DESC
      LIMIT :pageSize OFFSET :offset`,
    { ...binds(f), pageSize, offset: (page - 1) * pageSize },
  );

  return { rows: rows.map(toClaimRow), total: num(countRow?.n), page, pageSize };
};

const toClaimRow = (r: Record<string, unknown>): ClaimRow => {
  const status = (r.status as ClaimStatus) ?? "PENDING";
  const origin = (r.origin as Origin) ?? "WEB";
  return {
    id: String(r.id),
    userId: (r.userId as string | null) ?? null,
    name: fullName(r.firstName, r.lastName),
    email: (r.email as string | null) ?? null,
    accountEmail: (r.accountEmail as string | null) ?? null,
    mobile: (r.mobile as string | null) ?? null,
    videoUrl: String(r.videoUrl ?? ""),
    platform: (r.platform as VideoPlatform) ?? "YOUTUBE",
    status,
    statusLabel: CLAIM_STATUS_LABELS[status] ?? status,
    origin,
    originLabel: ORIGIN_LABELS[origin] ?? origin,
    submittedAt: iso(r.submittedAt),
    updatedAt: iso(r.updatedAt),
    ageDays:
      status === "PENDING" || status === "IN_REVIEW"
        ? daysSince(r.submittedAt as Date | null)
        : null,
    notifiedAt: iso(r.notifiedAt),
    lastActionBy: (r.lastActionBy as string | null) ?? null,
    lastActionAt: iso(r.lastActionAt),
    lastNote: (r.lastNote as string | null) ?? null,
    subscription: {
      planCode: (r.subPlanCode as string | null) ?? null,
      planName: (r.planName as string | null) ?? null,
      status: (r.subStatus as string | null) ?? null,
      isLive: Boolean(r.subIsLive),
    },
  };
};

export const claimsMetaService = async () => {
  const [counts] = await q<Record<string, number>>(
    `SELECT
       COUNT(*)::int                                             AS total,
       COUNT(*) FILTER (WHERE status = 'PENDING')::int           AS pending,
       COUNT(*) FILTER (WHERE status = 'IN_REVIEW')::int         AS "inReview",
       COUNT(*) FILTER (WHERE status = 'RESOLVED')::int          AS resolved,
       COUNT(*) FILTER (WHERE status = 'REJECTED')::int          AS rejected,
       COUNT(*) FILTER (WHERE status IN ('PENDING','IN_REVIEW')
                          AND "createdAt" <= now() - INTERVAL '2 days')::int AS ageing,
       COUNT(*) FILTER (WHERE status IN ('PENDING','IN_REVIEW')
                          AND "createdAt" <= now() - INTERVAL '5 days')::int AS breached
     FROM claims`,
  );

  const byPlatform = await q<{ platform: string; n: number }>(
    `SELECT platform, COUNT(*)::int AS n FROM claims GROUP BY platform`,
  );

  return {
    statuses: CLAIM_STATUSES.map((value) => ({
      value,
      label: CLAIM_STATUS_LABELS[value],
    })),
    platforms: VIDEO_PLATFORMS,
    origins: ORIGINS.map((value) => ({ value, label: ORIGIN_LABELS[value] })),
    counts: {
      total: num(counts?.total),
      pending: num(counts?.pending),
      inReview: num(counts?.inReview),
      resolved: num(counts?.resolved),
      rejected: num(counts?.rejected),
      ageing: num(counts?.ageing),
      breached: num(counts?.breached),
    },
    byPlatform: Object.fromEntries(byPlatform.map((r) => [r.platform, num(r.n)])),
    // Tighter than the channel SLA on purpose: a live claim is actively
    // demonetising somebody's video while it sits here.
    sla: { ageingAfterDays: 2, breachedAfterDays: 5 },
  };
};

export interface UpdateClaimInput {
  status: ClaimStatus;
  note?: string | null;
  skipNotify?: boolean;
}

/**
 * Move one claim's status. Same contract as the channel transition: DB write,
 * audit and ops stamp are atomic; the creator email is sent after commit and is
 * best-effort.
 */
export const updateClaimStatusService = async (
  claimId: string,
  input: UpdateClaimInput,
  actor: Actor,
): Promise<ClaimRow> => {
  const note = input.note?.trim() || null;
  if (input.status === "REJECTED" && !note) {
    throw new AppError("A reason is required when rejecting a claim.", 400);
  }

  const outcome = await inTransaction(async (run, select) => {
    const [row] = await select<{
      id: string;
      status: ClaimStatus;
      email: string | null;
      videoUrl: string;
      firstName: string | null;
      notifiedStatus: string | null;
    }>(
      `SELECT c.id::text AS id, c.status, c.email, c."videoUrl",
              u."firstName", o."notifiedStatus"
         FROM claims c
         LEFT JOIN users u ON u.id = c."userId"
         LEFT JOIN claim_ops o ON o."claimId" = c.id
        WHERE c.id = :claimId
        FOR UPDATE OF c`,
      { claimId },
    );
    if (!row) throw new AppError("No such claim.", 404);

    await run(
      `UPDATE claims SET status = :status, "updatedAt" = now() WHERE id = :claimId`,
      { claimId, status: input.status },
    );

    await run(
      `INSERT INTO whitelist_audit
         ("entityType","entityId","fromStatus","toStatus",note,"actorUserId","actorEmail")
       VALUES ('CLAIM', :entityId, :fromStatus, :toStatus, :note, :actorUserId, :actorEmail)`,
      {
        entityId: String(claimId),
        fromStatus: row.status ?? null,
        toStatus: input.status,
        note,
        actorUserId: actor.userId ?? null,
        actorEmail: actor.email ?? null,
      },
    );

    return row;
  });

  const alreadyTold = outcome.notifiedStatus === input.status;
  if (!input.skipNotify && !alreadyTold && claimNotifiable(input.status)) {
    const sent = await notifyClaim({
      email: outcome.email,
      firstName: outcome.firstName,
      videoUrl: outcome.videoUrl,
      status: input.status,
      note,
    });
    if (sent) {
      await exec(
        `INSERT INTO claim_ops ("claimId","notifiedStatus","notifiedAt","updatedAt")
         VALUES (:claimId, :status, now(), now())
         ON CONFLICT ("claimId") DO UPDATE SET
           "notifiedStatus" = EXCLUDED."notifiedStatus",
           "notifiedAt"     = EXCLUDED."notifiedAt",
           "updatedAt"      = now()`,
        { claimId, status: input.status },
      );
    }
  }

  // Re-read through the same projection the list uses, so a PATCH response and
  // a row in the table can never disagree about a claim's shape.
  return getClaimService(claimId);
};

export const getClaimService = async (claimId: string): Promise<ClaimRow> => {
  const origin = await originExpr("u");
  const rows = await q<Record<string, unknown>>(
    `SELECT c.id::text AS id, c."userId"::text AS "userId",
            u."firstName", u."lastName", u.email AS "accountEmail",
            c.email, c.mobile, c."videoUrl", c.platform, c.status,
            c."createdAt" AS "submittedAt", c."updatedAt",
            o."notifiedAt",
            a."actorEmail" AS "lastActionBy", a."createdAt" AS "lastActionAt", a.note AS "lastNote",
            COALESCE(s."planCode", s_any."planCode") AS "subPlanCode",
            COALESCE(s.status, s_any.status)         AS "subStatus",
            (s."planCode" IS NOT NULL)               AS "subIsLive",
            pl.name AS "planName",
            CASE WHEN u.id IS NULL THEN 'WEB' ELSE ${origin} END AS origin
     ${JOINS}
     WHERE c.id = :claimId`,
    { claimId },
  );
  if (!rows.length) throw new AppError("No such claim.", 404);
  return toClaimRow(rows[0]);
};

export const claimHistoryService = async (
  claimId: string,
): Promise<AuditEntry[]> => {
  const rows = await q<Record<string, unknown>>(
    `SELECT id::text AS id, "fromStatus", "toStatus", note, "actorEmail", "createdAt"
       FROM whitelist_audit
      WHERE "entityType" = 'CLAIM' AND "entityId" = :entityId
      ORDER BY "createdAt" DESC, id DESC`,
    { entityId: String(claimId) },
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
