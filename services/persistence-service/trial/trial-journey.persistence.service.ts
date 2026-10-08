import { Op, QueryTypes, UniqueConstraintError } from "sequelize";
import { BrandTrialModel } from "./schemas/brand-trial.schema";
import {
  TrialJourneySendModel,
  type TrialJourneySendAttributes,
} from "./schemas/trial-journey-send.schema";
import { TrialSignalModel, type TrialSignalAttributes } from "./schemas/trial-signal.schema";
import {
  JourneyChannel,
  JourneySendStatus,
  TrialSignalKind,
} from "../../dto-service/trial/trial-journey.dto";
import { PERSONAL_EMAIL_DOMAINS, TrialStatus } from "../../dto-service/trial/trial.dto";

// Personal-email domains never get a trial; any stray row on one is ignored by
// every journey query (same rule as findBrandTrial).
const PERSONAL = [...PERSONAL_EMAIL_DOMAINS];
const notPersonal = { [Op.notIn]: PERSONAL };

const db = () => BrandTrialModel.sequelize!;

// ── Sends ────────────────────────────────────────────────────────────────────

// Claim a slot by inserting its row. null = already claimed (by an earlier
// tick, or by the credit-exhaustion trigger racing this one).
export const claimJourneySend = async (
  attrs: TrialJourneySendAttributes,
): Promise<TrialJourneySendModel | null> => {
  try {
    return await TrialJourneySendModel.create({ ...attrs, status: JourneySendStatus.PENDING });
  } catch (err) {
    if (err instanceof UniqueConstraintError) return null;
    throw err;
  }
};

export const finishJourneySend = async (
  id: number,
  patch: Partial<TrialJourneySendAttributes>,
): Promise<void> => {
  await TrialJourneySendModel.update(patch, { where: { id } });
};

export const findSendsBySubject = async (
  subjectKey: string,
): Promise<TrialJourneySendModel[]> =>
  TrialJourneySendModel.findAll({ where: { subjectKey }, order: [["createdAt", "ASC"]] });

export const findSendById = async (id: number): Promise<TrialJourneySendModel | null> =>
  TrialJourneySendModel.findByPk(id);

// SES Open / Click events arrive by messageId. First open/click wins.
export const markSendEngagedByMessageId = async (
  messageId: string,
  kind: "open" | "click",
  at: Date = new Date(),
): Promise<boolean> => {
  const field = kind === "open" ? "openedAt" : "clickedAt";
  const patch: Partial<TrialJourneySendAttributes> =
    kind === "click" ? { clickedAt: at } : { openedAt: at };
  const [count] = await TrialJourneySendModel.update(patch, {
    where: { providerMessageId: messageId, [field]: null },
  });
  // A click implies the open, which image-blocking clients never report.
  if (kind === "click") {
    await TrialJourneySendModel.update(
      { openedAt: at },
      { where: { providerMessageId: messageId, openedAt: null } },
    );
  }
  return count > 0;
};

// Push opens/clicks come from the FE (OneSignal's click handler), scoped to the
// caller so nobody can mark someone else's notification.
export const markSendEngagedById = async (
  id: number,
  userId: number,
  kind: "open" | "click",
  at: Date = new Date(),
): Promise<void> => {
  const patch: Partial<TrialJourneySendAttributes> =
    kind === "click" ? { clickedAt: at, openedAt: at } : { openedAt: at };
  await TrialJourneySendModel.update(patch, {
    where: { id, userId, [kind === "click" ? "clickedAt" : "openedAt"]: null },
  });
};

// Push-slot copies for the in-app inbox — the fallback when push is off, so a
// push that was skipped (permission denied, provider unset) or reached no
// device still shows here. Only a claim that never got its copy is left out.
export const listPushSendsForBrand = async (
  brandId: number,
): Promise<TrialJourneySendModel[]> =>
  TrialJourneySendModel.findAll({
    where: {
      brandId,
      channel: JourneyChannel.PUSH,
      status: { [Op.ne]: JourneySendStatus.PENDING },
      title: { [Op.ne]: null },
    },
    order: [["createdAt", "DESC"]],
  });

// ── Signals ──────────────────────────────────────────────────────────────────

export const createTrialSignal = async (attrs: TrialSignalAttributes): Promise<TrialSignalModel> =>
  TrialSignalModel.create(attrs);

// null = the FE never reported a permission decision.
export const latestPushPermission = async (userId: number): Promise<boolean | null> => {
  const row = await TrialSignalModel.findOne({
    where: { userId, kind: TrialSignalKind.PUSH_PERMISSION },
    order: [["createdAt", "DESC"], ["id", "DESC"]],
  });
  return row ? Boolean(row.granted) : null;
};

export const listTutorialSkips = async (userId: number): Promise<Date[]> => {
  const rows = await TrialSignalModel.findAll({
    where: { userId, kind: TrialSignalKind.TUTORIAL_SKIP_CLICKED },
    attributes: ["createdAt"],
    order: [["createdAt", "ASC"]],
  });
  return rows.map((r) => r.createdAt);
};

export const countDistinctGatedTracks = async (brandId: number): Promise<number> => {
  const [row] = await db().query<{ n: string }>(
    `SELECT COUNT(DISTINCT "trackCode") AS n
       FROM trial_signals
      WHERE "brandId" = :brandId AND kind = :kind AND "trackCode" IS NOT NULL`,
    {
      replacements: { brandId, kind: TrialSignalKind.ENTERPRISE_TRACK_GATED_VIEWED },
      type: QueryTypes.SELECT,
    },
  );
  return Number(row?.n ?? 0);
};

// ── Trials the journey works on ──────────────────────────────────────────────

// Every trial inside its window (plus a day of slack for the Day-7 close).
export const listTrialsInJourney = async (since: Date): Promise<BrandTrialModel[]> =>
  BrandTrialModel.findAll({
    where: { status: TrialStatus.ACTIVE, startedAt: { [Op.gte]: since }, emailDomain: notPersonal },
    order: [["startedAt", "ASC"]],
  });

export const listTrialsDueForDay7 = async (now: Date): Promise<BrandTrialModel[]> =>
  BrandTrialModel.findAll({
    where: { endsAt: { [Op.lte]: now }, day7EvaluatedAt: null, emailDomain: notPersonal },
    limit: 500,
  });

export const markTrialActivated = async (brandId: number, at: Date = new Date()): Promise<void> => {
  await BrandTrialModel.update({ activatedAt: at }, { where: { brandId, activatedAt: null } });
};

export const setTrialDay7Segment = async (brandId: number, segment: string): Promise<boolean> => {
  const [count] = await BrandTrialModel.update(
    { day7Segment: segment, day7EvaluatedAt: new Date() },
    { where: { brandId, day7EvaluatedAt: null } },
  );
  return count > 0;
};

// ── Facts ────────────────────────────────────────────────────────────────────

export interface TrialMemberRow {
  id: number;
  email: string;
  firstName: string | null;
  status: string;
  createdBy: number | null;
}

export const listBrandMembers = async (brandId: number): Promise<TrialMemberRow[]> =>
  db().query<TrialMemberRow>(
    `SELECT id, email, "firstName", status, "createdBy"
       FROM users
      WHERE "brandId" = :brandId AND status <> 'DELETED'`,
    { replacements: { brandId }, type: QueryTypes.SELECT },
  );

export interface TrialLicenseRow {
  id: number;
  trackCode: string;
  createdAt: Date;
  videoLinks: number;
}

// Licenses the trial paid for (licenses.type = 'trial'), with usage-link count.
export const listTrialLicenses = async (brandId: number): Promise<TrialLicenseRow[]> => {
  const rows = await db().query<TrialLicenseRow & { videoLinks: string }>(
    `SELECT l.id, l."trackCode", l."createdAt",
            (SELECT COUNT(*) FROM video_links v WHERE v."licenseId" = l.id) AS "videoLinks"
       FROM licenses l
      WHERE l."brandId" = :brandId AND l.type = 'trial'
      ORDER BY l."createdAt" ASC`,
    { replacements: { brandId }, type: QueryTypes.SELECT },
  );
  return rows.map((r) => ({ ...r, videoLinks: Number(r.videoLinks) }));
};

// Did anyone on the brand log in again after `after`? (A new session = a
// return visit; the onboarding session itself is created before this cutoff.)
export const brandHasSessionAfter = async (brandId: number, after: Date): Promise<boolean> => {
  const [row] = await db().query<{ n: string }>(
    `SELECT COUNT(*) AS n
       FROM user_sessions s JOIN users u ON u.id = s."userId"
      WHERE u."brandId" = :brandId AND s."createdAt" > :after`,
    { replacements: { brandId, after }, type: QueryTypes.SELECT },
  );
  return Number(row?.n ?? 0) > 0;
};

export const userHasSessionAfter = async (userId: number, after: Date): Promise<boolean> => {
  const [row] = await db().query<{ n: string }>(
    `SELECT COUNT(*) AS n FROM user_sessions WHERE "userId" = :userId AND "createdAt" > :after`,
    { replacements: { userId, after }, type: QueryTypes.SELECT },
  );
  return Number(row?.n ?? 0) > 0;
};

export const userHasSeenTour = async (userId: number, tour: string): Promise<boolean> => {
  const [row] = await db().query<{ n: string }>(
    `SELECT COUNT(*) AS n FROM user_tour_seen WHERE "userId" = :userId AND tour = :tour`,
    { replacements: { userId, tour }, type: QueryTypes.SELECT },
  );
  return Number(row?.n ?? 0) > 0;
};

export interface DraftProjectRow {
  id: string;
  name: string;
  updatedAt: Date;
}

// The most recent Sound Tracking project left as a draft: a working track
// picked but never committed, untouched since `olderThan`.
export const findAbandonedSoundProject = async (
  userIds: number[],
  olderThan: Date,
): Promise<DraftProjectRow | null> => {
  if (!userIds.length) return null;
  const [row] = await db().query<DraftProjectRow>(
    `SELECT id, name, "updatedAt"
       FROM sound_projects
      WHERE "userId" IN (:userIds)
        AND status = 'ACTIVE'
        AND "committedTrackCode" IS NULL
        AND "updatedAt" < :olderThan
      ORDER BY "updatedAt" DESC
      LIMIT 1`,
    { replacements: { userIds, olderThan }, type: QueryTypes.SELECT },
  );
  return row ?? null;
};

export const findBrandInstagram = async (brandId: number): Promise<string | null> => {
  const [row] = await db().query<{ instagramLink: string | null }>(
    `SELECT "instagramLink" FROM brands WHERE id = :brandId`,
    { replacements: { brandId }, type: QueryTypes.SELECT },
  );
  return row?.instagramLink?.trim() || null;
};

export interface TopTrackRow {
  trackCode: string;
  name: string;
  artworkLink: string | null;
  downloads: number;
}

// "Top 5 most downloaded" for Email 2 — the same list for everyone, so the
// labels a trial cannot license are left out up front.
export const listTopDownloadedTracks = async (
  sinceDays: number,
  limit: number,
  excludeOwnerIds: string[],
): Promise<TopTrackRow[]> => {
  const rows = await db().query<TopTrackRow & { downloads: string }>(
    `SELECT t."trackCode", t.name, t."artworkLink", COUNT(*) AS downloads
       FROM licenses l
       JOIN tracks t ON t."trackCode" = l."trackCode"
      WHERE l."createdAt" > NOW() - (:sinceDays || ' days')::interval
        AND t.status = 'ACTIVE'
        ${excludeOwnerIds.length ? `AND NOT (COALESCE(t."ownerId", '{}') && ARRAY[:excludeOwnerIds]::uuid[])` : ""}
      GROUP BY t."trackCode", t.name, t."artworkLink"
      ORDER BY downloads DESC
      LIMIT :limit`,
    {
      replacements: { sinceDays: String(sinceDays), limit, excludeOwnerIds },
      type: QueryTypes.SELECT,
    },
  );
  return rows.map((r) => ({ ...r, downloads: Number(r.downloads) }));
};

// ── Team invites ─────────────────────────────────────────────────────────────

export interface PendingInviteRow {
  inviteeId: number;
  inviteeEmail: string;
  inviterId: number;
  inviterEmail: string;
  inviterFirstName: string | null;
  brandId: number;
  invitedAt: Date;
}

// Invites from a brand that is on an active trial, still not accepted after
// `olderThan`, sent during the trial.
export const listStaleTrialInvites = async (olderThan: Date): Promise<PendingInviteRow[]> =>
  db().query<PendingInviteRow>(
    `SELECT u.id AS "inviteeId", u.email AS "inviteeEmail",
            inv.id AS "inviterId", inv.email AS "inviterEmail", inv."firstName" AS "inviterFirstName",
            bt."brandId", u."createdAt" AS "invitedAt"
       FROM users u
       JOIN users inv ON inv.id = u."createdBy"
       JOIN brand_trials bt ON bt."brandId" = u."brandId"
      WHERE u.status = 'INVITED'
        AND u."createdAt" < :olderThan
        AND u."createdAt" >= bt."startedAt"
        AND bt.status = 'ACTIVE'
        AND bt."endsAt" > NOW()
        AND bt."emailDomain" NOT IN (:personal)
        AND lower(split_part(inv.email, '@', 2)) NOT IN (:personal)
      LIMIT 500`,
    { replacements: { olderThan, personal: PERSONAL }, type: QueryTypes.SELECT },
  );

// ── Pre-trial onboarding ─────────────────────────────────────────────────────

export interface IncompleteSignupRow {
  id: number;
  email: string;
  createdAt: Date;
}

// Self-signups (no createdBy, so not invites) on a work domain that never
// finished complete-profile — which is what creates their brand, so "no brand
// yet" is the test — inside the re-trigger window. Personal addresses are left
// out: the mail promises a trial they will never get.
export const listIncompleteSignups = async (
  createdAfter: Date,
  createdBefore: Date,
): Promise<IncompleteSignupRow[]> =>
  db().query<IncompleteSignupRow>(
    `SELECT id, email, "createdAt"
       FROM users
      WHERE platform = 'ENTERPRISE'
        AND "createdBy" IS NULL
        AND "brandId" IS NULL
        AND status <> 'DELETED'
        AND "createdAt" >= :createdAfter
        AND "createdAt" < :createdBefore
        AND lower(split_part(email, '@', 2)) NOT IN (:personal)
      LIMIT 1000`,
    { replacements: { createdAfter, createdBefore, personal: PERSONAL }, type: QueryTypes.SELECT },
  );

// ── Day-7 funnel ─────────────────────────────────────────────────────────────

export interface FunnelTrialRow {
  brandId: number;
  startedAt: Date;
  endsAt: Date;
  activatedAt: Date | null;
  day7Segment: string | null;
  licenses7d: number;
  licensesWithLink7d: number;
  paid7d: boolean;
  signupSource: string | null;
}

// One row per trial started in [from, to), with everything counted inside the
// trial's own 7 days (startedAt + 7d, not endsAt, so extensions don't stretch it).
export const listFunnelTrials = async (from: Date, to: Date): Promise<FunnelTrialRow[]> => {
  const rows = await db().query<any>(
    `SELECT bt."brandId", bt."startedAt", bt."endsAt", bt."activatedAt", bt."day7Segment",
            (SELECT COUNT(*) FROM licenses l
              WHERE l."brandId" = bt."brandId" AND l.type = 'trial'
                AND l."createdAt" < bt."startedAt" + interval '7 days') AS "licenses7d",
            (SELECT COUNT(*) FROM licenses l
              WHERE l."brandId" = bt."brandId" AND l.type = 'trial'
                AND l."createdAt" < bt."startedAt" + interval '7 days'
                AND EXISTS (SELECT 1 FROM video_links v WHERE v."licenseId" = l.id)) AS "licensesWithLink7d",
            EXISTS (SELECT 1 FROM token_assigned ta
                     WHERE ta."brandId" = bt."brandId"
                       AND ta."createdAt" < bt."startedAt" + interval '7 days') AS "paid7d",
            (SELECT p."discoveryChannel" FROM user_profiles p
              WHERE p."userId" = bt."startedByUserId") AS "signupSource"
       FROM brand_trials bt
      WHERE bt."startedAt" >= :from AND bt."startedAt" < :to
        AND bt."emailDomain" NOT IN (:personal)`,
    { replacements: { from, to, personal: PERSONAL }, type: QueryTypes.SELECT },
  );
  return rows.map((r: any) => ({
    ...r,
    brandId: Number(r.brandId),
    licenses7d: Number(r.licenses7d),
    licensesWithLink7d: Number(r.licensesWithLink7d),
    paid7d: Boolean(r.paid7d),
  }));
};
