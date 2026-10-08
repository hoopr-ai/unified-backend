import { UniqueConstraintError, Op, type Transaction } from "sequelize";
import { AppError } from "../../helper-service/AppError";
import { logger } from "../../helper-service/logger";
import {
  DAY_MS,
  SignupRejectReason,
  isPersonalEmailDomain,
  TRIAL_CREDIT_TYPES,
  TRIAL_CREDITS,
  TRIAL_CREDITS_PER_TYPE,
  TRIAL_DAYS,
  TRIAL_EXTENSION_CREDITS,
  TRIAL_EXTENSION_CREDITS_PER_TYPE,
  TYPE_CREDITS_EXHAUSTED,
  TRIAL_GRACE_HOURS,
  TrialBlockReason,
  TrialStatus,
  isSmashTrialEnabled,
  type AdminTrialListItem,
  CategoryPreference,
  type DiscoveryChannel,
  type OnboardingResponse,
  type TrialStateResponse,
} from "../../dto-service/trial/trial.dto";
import {
  brandIdsWithTokenAllocations,
  consumeTrialCredit,
  createBrandTrial,
  extendBrandTrial,
  findBrandTrial,
  findTrialLaunch,
  findUserOnboarding,
  isEmailDomainInUse,
  listBrandTrials,
  recordTrialLaunch,
  refundTrialCredit,
  upsertUserOnboarding,
  type BrandTrialModel,
} from "../../persistence-service/trial/modules.export";
import { BrandModel } from "../../persistence-service/brand/modules.export";
import { Platform } from "../../dto-service/constants/modules.export";

const GRACE_MS = TRIAL_GRACE_HOURS * 60 * 60 * 1000;

export const emailDomainOf = (email: string): string =>
  email.slice(email.lastIndexOf("@") + 1).trim().toLowerCase();

// Personal-email users (gmail.com & co.) never see or use a trial — not even
// one their brand is on — so every user-facing trial read checks this.
export const isTrialEmail = (email: string | null | undefined): boolean =>
  !!email && !isPersonalEmailDomain(emailDomainOf(email));

// ── Signup gate ──────────────────────────────────────────────────────────────

// Enforced at signup (send-email-otp, new ENTERPRISE users only) so an
// ineligible address never gets a user row. errorCode is the reason the FE
// branches on: domain_exists → route to sales.
//
// Personal addresses (gmail.com & co.) are NOT rejected: they sign up and log
// in exactly as before the trial existed — they simply never get one (see
// isTrialEligibleSignup). Their domain is shared by unrelated people, so the
// one-account-per-domain rule cannot apply to them either.
//
// Known gap: someone registering a fresh company-like domain each time passes.
// Closing that needs a phone/device-level check, which is not built.
export const assertSignupEligible = async (email: string): Promise<void> => {
  if (!isSmashTrialEnabled()) return;
  const domain = emailDomainOf(email);

  if (isPersonalEmailDomain(domain)) return;
  if (await isEmailDomainInUse(domain)) {
    throw new AppError(
      "Your company already has a Hoopr Smash account. Please ask a teammate to invite you, or talk to our sales team.",
      403,
      SignupRejectReason.DOMAIN_EXISTS,
    );
  }
};

// ── Trial lifecycle ──────────────────────────────────────────────────────────

// ── Launch time ──────────────────────────────────────────────────────────────

// When the trial went live: recorded in smash_trial_launch by the first boot
// with SMASH_TRIAL_ENABLED=true (ensureTrialLaunchRecorded) and never changed
// after — nothing to configure. Only accounts created at/after it can get a
// trial, which keeps every existing user out. null = trial never switched on.
let launchedAtCache: Date | null = null;
export const getTrialLaunchedAt = async (): Promise<Date | null> => {
  if (launchedAtCache) return launchedAtCache;
  // Normally recorded at boot; this covers a boot where the DB call failed.
  launchedAtCache = isSmashTrialEnabled() ? await recordTrialLaunch() : await findTrialLaunch();
  return launchedAtCache;
};

// Called once at startup, before the server accepts requests, so a signup
// arriving right after go-live is already on the right side of the cutoff.
export const ensureTrialLaunchRecorded = async (): Promise<void> => {
  if (!isSmashTrialEnabled()) return;
  try {
    const at = await getTrialLaunchedAt();
    logger.info("Smash trial launch time", { launchedAt: at?.toISOString() });
  } catch (err) {
    logger.error("Could not record the Smash trial launch time — no trial starts until it is", {
      error: (err as Error).message,
    });
  }
};

// Who may ever get a trial: a NEW self-signup on a work domain.
//   - ENTERPRISE only
//   - not a personal address (gmail.com & co.) — they use Smash trial-free
//   - created at/after the trial launch (getTrialLaunchedAt), so no existing
//     user is pulled in, even one finishing an old, half-done profile
//   - self-signed-up (no createdBy): admin-created and invited users never
//     start one
//   - no OTHER ENTERPRISE user or trial on the domain (the signup gate already
//     stops these; this re-check covers accounts created while it was off)
export const isTrialEligibleSignup = async (user: {
  id?: number;
  email: string;
  platform?: string | null;
  createdBy?: number | null;
  createdAt?: Date | null;
}): Promise<boolean> => {
  const launchedAt = await getTrialLaunchedAt();
  if (!launchedAt) return false;
  const domain = emailDomainOf(user.email);
  if (user.platform && user.platform !== Platform.ENTERPRISE) return false;
  if (isPersonalEmailDomain(domain)) return false;
  if (user.createdBy) return false;
  if (!user.createdAt || new Date(user.createdAt).getTime() < launchedAt.getTime()) return false;
  return !(await isEmailDomainInUse(domain, user.id));
};

// Will this user get the trial when they complete their profile? Lets the FE
// promise the credits only to people who will receive them (gmail, invited and
// pre-launch accounts never do). Same rule as startTrialForBrand.
export const isTrialOffered = async (user: {
  id?: number;
  email: string;
  platform?: string | null;
  createdBy?: number | null;
  createdAt?: Date | null;
}): Promise<boolean> => isSmashTrialEnabled() && (await isTrialEligibleSignup(user));

// Starts the clock at onboarding completion — called from complete-profile
// when a self-signed-up user creates their brand. Never throws: a trial that
// fails to start must not fail the profile save; the brand simply has no trial
// (and the unique-domain race is the only realistic way to get here).
// Returns true when a trial was started by this call.
export const startTrialForBrand = async (
  brandId: number,
  user: {
    id?: number;
    email: string;
    platform?: string | null;
    createdBy?: number | null;
    createdAt?: Date | null;
  },
): Promise<boolean> => {
  if (!isSmashTrialEnabled()) return false;
  if (!(await isTrialEligibleSignup(user))) return false;
  const userId = user.id!;
  const email = user.email;
  const startedAt = new Date();
  try {
    await createBrandTrial({
      brandId,
      startedByUserId: userId,
      emailDomain: emailDomainOf(email),
      creditsTotal: TRIAL_CREDITS,
      creditsByType: Object.fromEntries(TRIAL_CREDIT_TYPES.map((t) => [t, TRIAL_CREDITS_PER_TYPE])),
      startedAt,
      endsAt: new Date(startedAt.getTime() + TRIAL_DAYS * DAY_MS),
    });
    logger.info("Smash trial started", { brandId, userId });
    return true;
  } catch (err) {
    if (err instanceof UniqueConstraintError) {
      logger.warn("Smash trial not started: brand or domain already has one", {
        brandId,
        userId,
        domain: emailDomainOf(email),
      });
      return false;
    }
    logger.error("Failed to start Smash trial", {
      brandId,
      userId,
      error: (err as Error).message,
    });
    return false;
  }
};

// Self-heal for complete-profile: the trial starts after the profile/brand
// transaction commits, so a failure there leaves an eligible brand owner with a
// brand but no trial. Called on the owner's profile read; starts the missing
// trial (idempotent — brandId is unique on brand_trials). Cheap checks first so
// the common case (old users, existing trials) costs at most one indexed read.
export const resumeMissedTrialStart = async (
  user: {
    id?: number;
    email: string;
    brandId?: number | null;
    platform?: string | null;
    createdBy?: number | null;
    createdAt?: Date | null;
  },
  brand: { createdBy?: number | null } | null,
): Promise<boolean> => {
  if (!isSmashTrialEnabled() || !user.brandId || !brand) return false;
  if (Number(brand.createdBy) !== Number(user.id) || !isTrialEmail(user.email)) return false;
  const launchedAt = await getTrialLaunchedAt();
  if (!launchedAt || !user.createdAt || new Date(user.createdAt) < launchedAt) return false;
  if (await findBrandTrial(user.brandId)) return false;
  const started = await startTrialForBrand(user.brandId, user);
  if (started) {
    logger.warn("Smash trial started late (missed at complete-profile)", {
      brandId: user.brandId,
      userId: user.id,
    });
  }
  return started;
};

// Trial types the brand can still license with right now: on an active,
// unblocked trial and with a credit of that type left. Track listings treat
// these like a token (show the credit cost, hide the price). [] once the trial
// is converted, expired, used up, or the brand never had one.
export const getSpendableTrialTypes = async (brandId: number): Promise<string[]> => {
  const trial = await findBrandTrial(brandId);
  if (!trial) return [];
  const converted = (await brandIdsWithTokenAllocations([brandId])).has(Number(brandId));
  const state = resolveTrialState(trial, converted);
  if (state.planType !== "TRIAL" || state.licensingBlocked) return [];
  return state.creditsByType.filter((c) => c.creditsRemaining > 0).map((c) => c.type);
};

// The single place the trial rules live. Pure — `converted` and `now` come in.
export const resolveTrialState = (
  trial: BrandTrialModel,
  converted: boolean,
  now: Date = new Date(),
): TrialStateResponse => {
  const creditsTotal = trial.creditsTotal;
  const creditsRemaining = Math.max(0, creditsTotal - trial.creditsUsed);
  const endsAtMs = new Date(trial.endsAt).getTime();
  const elapsed = now.getTime() - new Date(trial.startedAt).getTime();
  const isPaid = converted || trial.status === TrialStatus.CONVERTED;

  let blockedReason: TrialBlockReason | null = null;
  if (!isPaid) {
    const expired = now.getTime() >= endsAtMs + GRACE_MS;
    const exhausted = creditsRemaining === 0;
    // Whichever came first: credits that ran out before day 7 read as
    // credits_exhausted even once day 7 has also passed.
    if (exhausted && (!expired || (trial.creditsExhaustedAt &&
        new Date(trial.creditsExhaustedAt).getTime() < endsAtMs))) {
      blockedReason = TrialBlockReason.CREDITS_EXHAUSTED;
    } else if (expired) {
      blockedReason = TrialBlockReason.TRIAL_EXPIRED;
    }
  }

  return {
    planType: isPaid ? "PAID" : "TRIAL",
    creditsTotal,
    creditsRemaining,
    creditsByType: TRIAL_CREDIT_TYPES.map((type) => {
      const total = Number(trial.creditsByType?.[type] ?? 0);
      const used = Number(trial.creditsUsedByType?.[type] ?? 0);
      return { type, creditsTotal: total, creditsRemaining: Math.max(0, total - used) };
    }),
    trialStart: trial.startedAt,
    trialEnd: trial.endsAt,
    daysLeft: Math.max(0, Math.ceil((endsAtMs - now.getTime()) / DAY_MS)),
    trialDay: Math.min(TRIAL_DAYS + 1, Math.max(1, Math.floor(elapsed / DAY_MS) + 1)),
    isExtended: trial.isExtended,
    licensingBlocked: blockedReason !== null,
    blockedReason,
  };
};

// null = this brand was never on the trial, or the viewer is on a personal
// email (pass their email; omit it only for internal/admin reads).
export const getTrialStateForBrand = async (
  brandId: number | null | undefined,
  viewerEmail?: string | null,
): Promise<TrialStateResponse | null> => {
  if (!brandId) return null;
  if (viewerEmail !== undefined && !isTrialEmail(viewerEmail)) return null;
  const trial = await findBrandTrial(brandId);
  if (!trial) return null;
  const converted = (await brandIdsWithTokenAllocations([brandId])).has(Number(brandId));
  return resolveTrialState(trial, converted);
};

const upgradeWallError = (reason: TrialBlockReason): AppError =>
  new AppError(
    reason === TrialBlockReason.CREDITS_EXHAUSTED
      ? "You've used all your trial credits. Upgrade to keep licensing tracks."
      : "Your 7-day trial has ended. Upgrade to keep licensing tracks.",
    403,
    reason,
  );

// Called by licensing when the brand has NO paid allocation covering the track.
// `types` are the track's owner types; the first one with a credit left pays.
//   - brand never on trial, already converted, or none of `types` is a trial
//     type → null (caller keeps its usual "not enough credits" error)
//   - trial blocked → throws the upgrade wall (403, errorCode = reason)
//   - these types used up, others not → 403 TYPE_CREDITS_EXHAUSTED
//   - otherwise spends one credit and returns the new state and the type paid
// The caller MUST call refundTrialCharge with that type if the license is not
// created after.
export const chargeTrialCredit = async (
  brandId: number,
  types: string[],
): Promise<{ state: TrialStateResponse; type: string } | null> => {
  const candidates = [...new Set(types)].filter((t) => TRIAL_CREDIT_TYPES.includes(t));
  if (!candidates.length) return null;
  const trial = await findBrandTrial(brandId);
  if (!trial) return null;
  const converted = (await brandIdsWithTokenAllocations([brandId])).has(Number(brandId));
  if (converted || trial.status === TrialStatus.CONVERTED) return null;

  for (const type of candidates) {
    const updated = await consumeTrialCredit(brandId, type, GRACE_MS);
    if (updated) return { state: resolveTrialState(updated, false), type };
  }
  // Lost the race, blocked, or out of these types — re-read to say why.
  const state = resolveTrialState((await findBrandTrial(brandId))!, false);
  if (state.blockedReason) throw upgradeWallError(state.blockedReason);
  throw new AppError(
    `You've used your trial credit for ${candidates.join(" / ")} tracks. Upgrade to keep licensing them.`,
    403,
    TYPE_CREDITS_EXHAUSTED,
  );
};

export const refundTrialCharge = async (brandId: number, type: string): Promise<void> => {
  try {
    await refundTrialCredit(brandId, type);
  } catch (err) {
    logger.error("Failed to refund Smash trial credit", {
      brandId,
      type,
      error: (err as Error).message,
    });
  }
};

// ── Onboarding answers ───────────────────────────────────────────────────────

export const saveOnboardingAnswers = async (
  userId: number,
  categoryPreferences: CategoryPreference[] | undefined,
  discoveryChannel: DiscoveryChannel | undefined,
  transaction?: Transaction,
): Promise<void> => {
  if (!categoryPreferences && !discoveryChannel) return;
  await upsertUserOnboarding(
    userId,
    Array.from(new Set(categoryPreferences ?? [])),
    discoveryChannel ?? null,
    transaction,
  );
};

export const getOnboardingAnswers = async (
  userId: number,
): Promise<OnboardingResponse | null> => {
  const row = await findUserOnboarding(userId);
  // user_profiles rows also exist for social links alone — no answers = null.
  if (!row || (!row.categoryPreferences?.length && !row.discoveryChannel)) return null;
  return {
    categoryPreferences: (row.categoryPreferences ?? []) as CategoryPreference[],
    discoveryChannel: (row.discoveryChannel ?? null) as DiscoveryChannel | null,
  };
};

// ── Admin ────────────────────────────────────────────────────────────────────

const toAdminItem = (
  trial: BrandTrialModel,
  converted: boolean,
  brandName: string | null,
): AdminTrialListItem => ({
  brandId: Number(trial.brandId),
  brandName,
  emailDomain: trial.emailDomain,
  startedByUserId: trial.startedByUserId,
  extendedAt: trial.extendedAt ?? null,
  extendedById: trial.extendedById ?? null,
  ...resolveTrialState(trial, converted),
});

export const listTrialsService = async (opts: {
  page: number;
  limit: number;
  search?: string;
}): Promise<{ items: AdminTrialListItem[]; total: number; page: number; limit: number }> => {
  const { rows, count } = await listBrandTrials({
    limit: opts.limit,
    offset: (opts.page - 1) * opts.limit,
    search: opts.search,
  });
  const brandIds = rows.map((r) => Number(r.brandId));
  const [converted, brands] = await Promise.all([
    brandIdsWithTokenAllocations(brandIds),
    brandIds.length
      ? BrandModel.findAll({ where: { id: { [Op.in]: brandIds } }, attributes: ["id", "name"], raw: true })
      : Promise.resolve([]),
  ]);
  const nameById = new Map((brands as any[]).map((b) => [Number(b.id), b.name as string]));
  return {
    items: rows.map((t) =>
      toAdminItem(t, converted.has(Number(t.brandId)), nameById.get(Number(t.brandId)) ?? null),
    ),
    total: count,
    page: opts.page,
    limit: opts.limit,
  };
};

// The discretionary extension: +1 credit on every type, once per brand, never
// changes TRIAL_CREDITS. It adds credits only — a trial already past day 7
// stays expired.
export const extendTrialService = async (
  brandId: number,
  adminUserId: number,
): Promise<AdminTrialListItem> => {
  const existing = await findBrandTrial(brandId);
  if (!existing) throw new AppError("This brand is not on a trial", 404);

  const updated = await extendBrandTrial(
    brandId,
    TRIAL_CREDIT_TYPES,
    TRIAL_EXTENSION_CREDITS_PER_TYPE,
    adminUserId,
  );
  if (!updated) throw new AppError("This trial has already been extended", 409);

  logger.info("Smash trial extended", { brandId, adminUserId, credits: TRIAL_EXTENSION_CREDITS });
  const converted = (await brandIdsWithTokenAllocations([brandId])).has(Number(brandId));
  const brand = await BrandModel.findByPk(brandId, { attributes: ["name"] });
  return toAdminItem(updated, converted, (brand as any)?.name ?? null);
};
