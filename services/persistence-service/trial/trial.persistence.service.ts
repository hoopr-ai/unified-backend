import { Op, QueryTypes, fn, col, literal, where as sqlWhere } from "sequelize";
import {
  BrandTrialModel,
  type BrandTrialAttributes,
} from "./schemas/brand-trial.schema";
import { UserOnboardingModel } from "./schemas/user-onboarding.schema";
import { UserModel } from "../user/schemas/user.schema";
import { TokenAssignedModel } from "../token/schemas/token-assigned.schema";
import { Platform } from "../../dto-service/modules.export";
import { PERSONAL_EMAIL_DOMAINS } from "../../dto-service/trial/trial.dto";

// ── Signup gate ──────────────────────────────────────────────────────────────

// Is this company domain already taken — by any ENTERPRISE user (whatever their
// status) or by a trial? Backed by idx_users_enterprise_email_domain.
// `excludeUserId`: the user asking, when they already have a row (trial start).
export const isEmailDomainInUse = async (
  domain: string,
  excludeUserId?: number,
): Promise<boolean> => {
  const lower = domain.toLowerCase();
  const [userCount, trialCount] = await Promise.all([
    UserModel.count({
      where: {
        platform: Platform.ENTERPRISE,
        ...(excludeUserId ? { id: { [Op.ne]: excludeUserId } } : {}),
        [Op.and]: [
          sqlWhere(fn("lower", fn("split_part", col("email"), "@", 2)), lower),
        ],
      },
    }),
    BrandTrialModel.count({ where: { emailDomain: lower } }),
  ]);
  return userCount > 0 || trialCount > 0;
};

// ── Trial rows ───────────────────────────────────────────────────────────────

export const createBrandTrial = async (
  attrs: BrandTrialAttributes,
): Promise<BrandTrialModel> => BrandTrialModel.create(attrs);

// Every read of a trial goes through here. A row on a personal-email domain
// can only exist from before the gmail rule (or a hand-made test row); it is
// treated as no trial at all, so a gmail user never sees trial UI, credits,
// nudges or journey sends.
export const findBrandTrial = async (
  brandId: number,
): Promise<BrandTrialModel | null> =>
  BrandTrialModel.findOne({
    where: { brandId, emailDomain: { [Op.notIn]: [...PERSONAL_EMAIL_DOMAINS] } },
  });

// Spend one credit, atomically. The WHERE is the whole eligibility rule, so two
// concurrent downloads can never both take the last credit: returns the
// updated row, or null when the trial is expired, used up, or converted.
export const consumeTrialCredit = async (
  brandId: number,
  graceMs: number,
): Promise<BrandTrialModel | null> => {
  const [count, rows] = await BrandTrialModel.update(
    {
      creditsUsed: literal(`"creditsUsed" + 1`),
      creditsExhaustedAt: literal(
        `CASE WHEN "creditsUsed" + 1 >= "creditsTotal" THEN NOW() ELSE NULL END`,
      ),
    } as any,
    {
      where: {
        brandId,
        status: "ACTIVE",
        creditsUsed: { [Op.lt]: col("creditsTotal") },
        endsAt: { [Op.gt]: new Date(Date.now() - graceMs) },
      },
      returning: true,
    },
  );
  return count > 0 ? rows[0] : null;
};

// Undo consumeTrialCredit when the license it paid for could not be created.
export const refundTrialCredit = async (brandId: number): Promise<void> => {
  await BrandTrialModel.update(
    { creditsUsed: literal(`"creditsUsed" - 1`), creditsExhaustedAt: null } as any,
    { where: { brandId, creditsUsed: { [Op.gt]: 0 } } },
  );
};

// One-time +N credits. Returns null if there is no trial or it was already
// extended — the extension is discretionary, not repeatable.
export const extendBrandTrial = async (
  brandId: number,
  extraCredits: number,
  extendedById: number,
): Promise<BrandTrialModel | null> => {
  const [count, rows] = await BrandTrialModel.update(
    {
      creditsTotal: literal(`"creditsTotal" + ${Number(extraCredits)}`),
      creditsExhaustedAt: null,
      isExtended: true,
      extendedAt: new Date(),
      extendedById,
    } as any,
    { where: { brandId, isExtended: false }, returning: true },
  );
  return count > 0 ? rows[0] : null;
};

export const listBrandTrials = async (opts: {
  limit: number;
  offset: number;
  search?: string;
}): Promise<{ rows: BrandTrialModel[]; count: number }> =>
  BrandTrialModel.findAndCountAll({
    where: {
      emailDomain: {
        [Op.notIn]: [...PERSONAL_EMAIL_DOMAINS],
        ...(opts.search ? { [Op.iLike]: `%${opts.search.toLowerCase()}%` } : {}),
      },
    },
    order: [["startedAt", "DESC"]],
    limit: opts.limit,
    offset: opts.offset,
  });

// ── Conversion ───────────────────────────────────────────────────────────────

// A brand that has ever been given an allocation has left the trial for good,
// even if that allocation has since run dry — it goes to the paid top-up flow,
// not back behind the trial wall.
export const brandIdsWithTokenAllocations = async (
  brandIds: number[],
): Promise<Set<number>> => {
  if (brandIds.length === 0) return new Set();
  const rows = await TokenAssignedModel.findAll({
    where: { brandId: { [Op.in]: brandIds } },
    attributes: ["brandId"],
    group: ["brandId"],
    raw: true,
  });
  return new Set(rows.map((r: any) => Number(r.brandId)));
};

// ── Onboarding answers ───────────────────────────────────────────────────────

export const upsertUserOnboarding = async (
  userId: number,
  categoryPreferences: string[],
  discoveryChannel: string | null,
): Promise<void> => {
  await UserOnboardingModel.upsert({ userId, categoryPreferences, discoveryChannel });
};

export const findUserOnboarding = async (
  userId: number,
): Promise<UserOnboardingModel | null> => UserOnboardingModel.findByPk(userId);

// ── Launch time ──────────────────────────────────────────────────────────────

// Records "now" as the trial launch unless a launch is already recorded, and
// returns whichever is stored. Safe to call from every instance at once.
export const recordTrialLaunch = async (): Promise<Date> => {
  const db = BrandTrialModel.sequelize!;
  await db.query(
    `INSERT INTO smash_trial_launch (id, "launchedAt") VALUES (1, NOW()) ON CONFLICT (id) DO NOTHING`,
  );
  return (await findTrialLaunch())!;
};

export const findTrialLaunch = async (): Promise<Date | null> => {
  const [row] = await BrandTrialModel.sequelize!.query<{ launchedAt: Date }>(
    `SELECT "launchedAt" FROM smash_trial_launch WHERE id = 1`,
    { type: QueryTypes.SELECT },
  );
  return row ? new Date(row.launchedAt) : null;
};
