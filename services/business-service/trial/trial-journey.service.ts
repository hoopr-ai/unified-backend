import jwt from "jsonwebtoken";
import { AppError, createJWTToken } from "../../helper-service/modules.export";
import { logger } from "../../helper-service/logger";
import { sendEmail } from "../../helper-service/email.service";
import { sendSesEmail } from "../../helper-service/ses.client";
import { isPushConfigured, sendPush } from "../../helper-service/push.service";
import {
  BUDGET_EMAIL_SLOTS,
  CategoryPreference,
  DAY_MS,
  Day7Segment,
  JourneyChannel,
  JourneySendStatus,
  JourneySlot,
  JourneyVariant,
  Platform,
  TRIAL_DAYS,
  TrialNudgeKey,
  TrialSignalKind,
  TrialStatus,
  isSmashTrialEnabled,
  isTrialJourneyEnabled,
  type FunnelStage,
  type JourneyMessage,
  type TrialFunnelResponse,
  type TrialInboxItem,
  type TrialNudge,
  type TrialSignalRequestData,
  type TrialStateResponse,
  type TrialWithNudgesResponse,
} from "../../dto-service/modules.export";
import {
  brandHasSessionAfter,
  brandIdsWithTokenAllocations,
  claimJourneySend,
  countDistinctGatedTracks,
  createTrialSignal,
  findAbandonedSoundProject,
  findBrandInstagram,
  findBrandTrial,
  findSendsBySubject,
  findUserOnboarding,
  finishJourneySend,
  latestPushPermission,
  listBrandMembers,
  listFunnelTrials,
  listIncompleteSignups,
  listPushSendsForBrand,
  listStaleTrialInvites,
  listTopDownloadedTracks,
  listTrialLicenses,
  listTrialsDueForDay7,
  listTrialsInJourney,
  listTutorialSkips,
  markSendEngagedById,
  markSendEngagedByMessageId,
  markTrialActivated,
  setTrialDay7Segment,
  userHasSeenTour,
  userHasSessionAfter,
  type BrandTrialModel,
  type TopTrackRow,
  type TrialJourneySendModel,
  type TrialJourneySendAttributes,
} from "../../persistence-service/trial/modules.export";
import { findUserById } from "../../persistence-service/exports";
import {
  isEmailSuppressed,
  upsertSuppression,
} from "../../persistence-service/email-campaign/modules.export";
import { EmailSuppressionReason } from "../../dto-service/email-campaign/modules.export";
import { resolveViewerOwnerAccess } from "../access/owner-access.service";
import { getTrialLaunchedAt, isTrialEmail, resolveTrialState } from "./trial.service";
import { createMagicLoginUrl, frontendUrl } from "./magic-link.service";
import * as T from "./trial-journey.templates";

// The trial conversion journey (docs/SMASH-TRIAL.md, "step 2"):
//   - 3 emails + 3 pushes per trial, never more — each slot is claimed by
//     inserting its trial_journey_sends row first (UNIQUE(subjectKey, slot))
//   - a 10-minute tick decides what is due; credit exhaustion pulls Push 3
//     forward on the spot
//   - in-app nudges are computed on read (GET /user/trial), never sent
//   - sales alerts, invite reminders and onboarding re-triggers ride the same
//     send log but sit outside the trial user's budget

const HOUR_MS = 60 * 60 * 1000;
// The onboarding session itself runs into the first minutes; real use after
// that is what moves a trial from the "not logged in" lane to "activated".
const ACTIVATION_GRACE_MS = 10 * 60 * 1000;
const SMASH_APP_TOUR = "smashAppTour";

// Scheduled sends go out between 10:00 and 20:00 IST only. Credit exhaustion
// is exempt: the user is in the product right now.
const SEND_HOURS_IST = { from: 10, to: 20 };

export const isInSendHours = (now: Date): boolean => {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hour12: false, timeZone: "Asia/Kolkata" })
      .format(now),
  );
  return hour >= SEND_HOURS_IST.from && hour < SEND_HOURS_IST.to;
};

const brandKey = (brandId: number) => `brand:${brandId}`;

// ── Windows ──────────────────────────────────────────────────────────────────

// [open, close) in ms after startedAt; non-overlapping per channel, so a tick
// that was down for a while sends the slot that is due now and lets a missed
// earlier one go rather than firing two at once. Email 3 hangs off endsAt
// ("2 days before expiry").
export const slotWindow = (
  slot: JourneySlot,
  trial: Pick<BrandTrialModel, "startedAt" | "endsAt">,
): [number, number] => {
  const start = new Date(trial.startedAt).getTime();
  const end = new Date(trial.endsAt).getTime();
  const at = (days: number) => start + days * DAY_MS;
  switch (slot) {
    case JourneySlot.EMAIL_1: return [at(1), at(4)];
    case JourneySlot.EMAIL_2: return [at(4), end - 2 * DAY_MS];
    case JourneySlot.EMAIL_3: return [end - 2 * DAY_MS, end];
    case JourneySlot.PUSH_1: return [at(2), at(5)];
    case JourneySlot.PUSH_2: return [at(5), at(6)];
    case JourneySlot.PUSH_3: return [at(6), end];
    default: return [Infinity, -Infinity];
  }
};

const inWindow = (slot: JourneySlot, trial: BrandTrialModel, now: Date) => {
  const [open, close] = slotWindow(slot, trial);
  const t = now.getTime();
  return t >= open && t < close;
};

// ── Facts ────────────────────────────────────────────────────────────────────

interface Recipient {
  id: number;
  email: string;
  firstName: string | null;
}

export interface JourneyFacts {
  trial: BrandTrialModel;
  state: TrialStateResponse;
  recipient: Recipient;
  activated: boolean;
  // null = the FE never reported a decision; we still try, OneSignal knows.
  pushPermission: boolean | null;
  categories: CategoryPreference[];
  sends: Map<string, TrialJourneySendModel>;
}

// First real use after onboarding: a credit spent, the tutorial finished, a
// return login, or (set elsewhere) a poll of the trial meter after the grace.
const detectActivation = async (trial: BrandTrialModel, recipientId: number): Promise<boolean> => {
  if (trial.activatedAt) return true;
  const after = new Date(new Date(trial.startedAt).getTime() + ACTIVATION_GRACE_MS);
  const active =
    trial.creditsUsed > 0 ||
    (await userHasSeenTour(recipientId, SMASH_APP_TOUR)) ||
    (await brandHasSessionAfter(Number(trial.brandId), after));
  if (active) await markTrialActivated(Number(trial.brandId));
  return active;
};

const loadFacts = async (trial: BrandTrialModel): Promise<JourneyFacts | null> => {
  const brandId = Number(trial.brandId);
  const converted = (await brandIdsWithTokenAllocations([brandId])).has(brandId);
  const state = resolveTrialState(trial, converted);
  // The journey ends the moment the brand pays.
  if (state.planType === "PAID") return null;

  const user = await findUserById(trial.startedByUserId);
  if (!user || (user as any).status === "DELETED" || Number(user.brandId) !== brandId) return null;
  const recipient: Recipient = { id: user.id!, email: user.email, firstName: user.firstName ?? null };

  const [activated, pushPermission, onboarding, sendRows] = await Promise.all([
    detectActivation(trial, recipient.id),
    latestPushPermission(recipient.id),
    findUserOnboarding(recipient.id),
    findSendsBySubject(brandKey(brandId)),
  ]);
  return {
    trial,
    state,
    recipient,
    activated,
    pushPermission,
    categories: (onboarding?.categoryPreferences ?? []) as CategoryPreference[],
    sends: new Map(sendRows.map((s) => [s.slot, s])),
  };
};

// ── Planning (pure) ──────────────────────────────────────────────────────────

export interface PlannedSend {
  slot: JourneySlot;
  channel: JourneyChannel;
  variant: JourneyVariant;
}

// Push 3's branch, by credits used.
export const push3Variant = (state: TrialStateResponse): JourneyVariant => {
  const used = state.creditsTotal - state.creditsRemaining;
  if (state.creditsRemaining === 0) return JourneyVariant.EXHAUSTED;
  if (used >= 2) return JourneyVariant.CONVERTED;
  if (used === 1) return JourneyVariant.NEEDS_ASSISTANCE;
  return JourneyVariant.NOT_CONVERTED;
};

// What is due for this trial right now: at most one email and one push.
// `exhausted` = called from the licensing path the moment credits hit 0.
export const planDueSends = (
  f: Pick<JourneyFacts, "trial" | "state" | "activated" | "sends">,
  now: Date,
  opts: { exhausted?: boolean } = {},
): PlannedSend[] => {
  const out: PlannedSend[] = [];
  const claimed = (slot: JourneySlot) => f.sends.has(slot);
  const lane = f.activated ? JourneyVariant.ACTIVATED : JourneyVariant.NOT_ACTIVATED;
  const used = f.state.creditsTotal - f.state.creditsRemaining;
  const expired = now.getTime() >= new Date(f.trial.endsAt).getTime();

  // Credit exhaustion: pull Push 3 forward, any day, any hour. Email 3 stays
  // a flat date-based reminder.
  if (opts.exhausted || (f.state.creditsRemaining === 0 && !expired)) {
    if (!claimed(JourneySlot.PUSH_3)) {
      out.push({ slot: JourneySlot.PUSH_3, channel: JourneyChannel.PUSH, variant: JourneyVariant.EXHAUSTED });
    }
    if (opts.exhausted) return out;
  }

  if (!isInSendHours(now)) return out;

  // Emails — everyone, one per tick.
  for (const slot of BUDGET_EMAIL_SLOTS) {
    if (claimed(slot) || !inWindow(slot, f.trial, now)) continue;
    out.push({
      slot,
      channel: JourneyChannel.EMAIL,
      variant: slot === JourneySlot.EMAIL_2 ? JourneyVariant.STANDARD : lane,
    });
    break;
  }

  // Pushes — skip once a push already went this tick (exhaustion above).
  if (out.some((p) => p.channel === JourneyChannel.PUSH)) return out;

  if (!claimed(JourneySlot.PUSH_1) && inWindow(JourneySlot.PUSH_1, f.trial, now) && used === 0) {
    // No-click escalation: Push 1 becomes primary when Email 1 went out a day
    // ago and was never opened — even for the not-activated lane.
    const e1 = f.sends.get(JourneySlot.EMAIL_1);
    const e1Ignored =
      !!e1?.sentAt && !e1.openedAt && now.getTime() - new Date(e1.sentAt).getTime() >= DAY_MS;
    if (f.activated || e1Ignored) {
      out.push({ slot: JourneySlot.PUSH_1, channel: JourneyChannel.PUSH, variant: lane });
      return out;
    }
  }
  if (
    !claimed(JourneySlot.PUSH_2) &&
    inWindow(JourneySlot.PUSH_2, f.trial, now) &&
    f.activated &&
    f.state.creditsRemaining > 0
  ) {
    // Variant (draft resume vs credits nudge) is settled at render time.
    out.push({ slot: JourneySlot.PUSH_2, channel: JourneyChannel.PUSH, variant: JourneyVariant.CREDITS_REMAINING });
    return out;
  }
  if (!claimed(JourneySlot.PUSH_3) && inWindow(JourneySlot.PUSH_3, f.trial, now)) {
    out.push({ slot: JourneySlot.PUSH_3, channel: JourneyChannel.PUSH, variant: push3Variant(f.state) });
  }
  return out;
};

// ── Sending ──────────────────────────────────────────────────────────────────

const unsubscribeUrl = (email: string): string => {
  const token = createJWTToken({ email: email.toLowerCase(), purpose: "trial_unsub" }, "365d");
  return `${apiBaseUrl()}/trial-journey/unsubscribe?token=${encodeURIComponent(token)}`;
};

// This service's public origin, for links that hit the API directly
// (unsubscribe). Prod is the host enterprise-fe's VITE_API_URL points at.
const apiBaseUrl = (): string =>
  (process.env.API_BASE_URL || "https://api-smash.hoopr.ai").replace(/\/+$/, "");

type Claim = Omit<TrialJourneySendAttributes, "status">;

// Claim → render (the row id goes into the magic link / push payload) → send →
// record. Returns the final status, or null when someone else holds the slot.
const claimAndSend = async (
  claim: Claim,
  render: (sendId: number) => Promise<JourneyMessage | null>,
  deliver: (msg: JourneyMessage, sendId: number) => Promise<Partial<TrialJourneySendAttributes>>,
): Promise<JourneySendStatus | null> => {
  const row = await claimJourneySend(claim);
  if (!row) return null;
  let msg: JourneyMessage | null = null;
  try {
    msg = await render(row.id);
    if (!msg) {
      await finishJourneySend(row.id, { status: JourneySendStatus.SKIPPED, error: "nothing to send" });
      return JourneySendStatus.SKIPPED;
    }
    const result = await deliver(msg, row.id);
    const status = result.status ?? JourneySendStatus.SENT;
    await finishJourneySend(row.id, {
      variant: msg.variant ?? claim.variant ?? null,
      title: msg.subject,
      body: msg.body,
      url: msg.url,
      sentAt: status === JourneySendStatus.SENT || status === JourneySendStatus.UNDELIVERED ? new Date() : null,
      ...result,
      status,
    });
    return status;
  } catch (err) {
    logger.error("[TrialJourney] Send failed", { slot: claim.slot, subjectKey: claim.subjectKey, error: (err as Error).message });
    await finishJourneySend(row.id, {
      status: JourneySendStatus.FAILED,
      error: (err as Error).message.slice(0, 1000),
      title: msg?.subject ?? null,
      body: msg?.body ?? null,
      url: msg?.url ?? null,
    });
    return JourneySendStatus.FAILED;
  }
};

const deliverEmail = (to: string) =>
  async (msg: JourneyMessage): Promise<Partial<TrialJourneySendAttributes>> => {
    if (await isEmailSuppressed(to.toLowerCase())) {
      return { status: JourneySendStatus.SKIPPED, error: "address suppressed (bounce/complaint/unsubscribe)" };
    }
    const { messageId } = await sendSesEmail({ to, subject: msg.subject, html: msg.html! });
    return { status: JourneySendStatus.SENT, providerMessageId: messageId };
  };

const deliverPush = (userId: number, permission: boolean | null) =>
  async (msg: JourneyMessage, sendId: number): Promise<Partial<TrialJourneySendAttributes>> => {
    // The copy is stored either way: it is also the in-app inbox item.
    if (permission === false) {
      return { status: JourneySendStatus.SKIPPED, error: "push permission denied — in-app only" };
    }
    if (!isPushConfigured()) {
      return { status: JourneySendStatus.SKIPPED, error: "OneSignal not configured — in-app only" };
    }
    const res = await sendPush({
      userId,
      title: msg.subject,
      body: msg.body,
      url: msg.url,
      data: { trialSendId: sendId, slot: msg.slot },
    });
    return {
      status: res.delivered ? JourneySendStatus.SENT : JourneySendStatus.UNDELIVERED,
      providerMessageId: res.id,
    };
  };

const templateContext = async (
  f: JourneyFacts,
  magicLinkSendId: number | null,
): Promise<T.TemplateContext> => ({
  firstName: f.recipient.firstName,
  creditsRemaining: f.state.creditsRemaining,
  creditsTotal: f.state.creditsTotal,
  creditsUsed: f.state.creditsTotal - f.state.creditsRemaining,
  trialEnd: new Date(f.trial.endsAt),
  categories: f.categories,
  magicLinkUrl:
    magicLinkSendId !== null
      ? await createMagicLoginUrl(f.recipient.id, f.recipient.email, magicLinkSendId)
      : null,
  unsubscribeUrl: unsubscribeUrl(f.recipient.email),
});

// Computed at most once per tick: Email 2 is the same list for everyone.
let topTracksMemo: { at: number; rows: TopTrackRow[] } | null = null;
const topTracks = async (): Promise<TopTrackRow[]> => {
  if (topTracksMemo && Date.now() - topTracksMemo.at < HOUR_MS) return topTracksMemo.rows;
  const access = await resolveViewerOwnerAccess(null, Platform.ENTERPRISE);
  const rows = await listTopDownloadedTracks(30, 5, Array.from(access.blockedOwnerIds));
  topTracksMemo = { at: Date.now(), rows };
  return rows;
};

const renderPlanned = (f: JourneyFacts, p: PlannedSend) => async (sendId: number) => {
  const notActivated = p.variant === JourneyVariant.NOT_ACTIVATED;
  switch (p.slot) {
    case JourneySlot.EMAIL_1:
      return T.email1(await templateContext(f, notActivated ? sendId : null), !notActivated);
    case JourneySlot.EMAIL_2: {
      const rows = await topTracks();
      return T.email2(await templateContext(f, null), rows);
    }
    case JourneySlot.EMAIL_3:
      return T.email3(await templateContext(f, notActivated ? sendId : null), !notActivated);
    case JourneySlot.PUSH_1:
      return T.push1(await templateContext(f, null));
    case JourneySlot.PUSH_2: {
      const draft = await findAbandonedSoundProject(
        [f.recipient.id],
        new Date(Date.now() - DAY_MS),
      );
      return T.push2(await templateContext(f, null), draft);
    }
    case JourneySlot.PUSH_3:
      return T.push3(await templateContext(f, null), p.variant);
    default:
      return null;
  }
};

const runPlanned = async (f: JourneyFacts, plan: PlannedSend[]) => {
  for (const p of plan) {
    await claimAndSend(
      {
        subjectKey: brandKey(Number(f.trial.brandId)),
        slot: p.slot,
        brandId: Number(f.trial.brandId),
        userId: f.recipient.id,
        channel: p.channel,
        variant: p.variant,
      },
      renderPlanned(f, p),
      p.channel === JourneyChannel.EMAIL
        ? deliverEmail(f.recipient.email)
        : deliverPush(f.recipient.id, f.pushPermission),
    );
  }
};

export const runJourneyForTrial = async (
  trial: BrandTrialModel,
  now: Date,
  opts: { exhausted?: boolean } = {},
): Promise<number> => {
  const f = await loadFacts(trial);
  if (!f) return 0;
  const plan = planDueSends(f, now, opts);
  await runPlanned(f, plan);
  return plan.length;
};

// ── Sales alerts (internal, outside the budget) ──────────────────────────────

const salesRecipients = (): string[] =>
  (process.env.SALES_ALERT_EMAILS || "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);

export const sendSalesAlert = async (
  slot: JourneySlot,
  subjectKey: string,
  brandId: number | null,
  subject: string,
  lines: Record<string, string | number | null>,
): Promise<void> => {
  if (!isTrialJourneyEnabled()) return;
  await claimAndSend(
    { subjectKey, slot, brandId, channel: JourneyChannel.INTERNAL, variant: null },
    async () => T.salesAlert(slot, subject, lines),
    async (msg) => {
      const to = salesRecipients();
      if (!to.length) {
        logger.warn("[TrialJourney] SALES_ALERT_EMAILS not set — sales alert not sent", { slot, subjectKey });
        return { status: JourneySendStatus.SKIPPED, error: "SALES_ALERT_EMAILS not set" };
      }
      await sendEmail({ to: to.join(","), subject: msg.subject, html: msg.html! });
      return { status: JourneySendStatus.SENT };
    },
  );
};

const brandAlertLines = async (brandId: number, extra: Record<string, string | number | null> = {}) => {
  const trial = await findBrandTrial(brandId);
  const members = await listBrandMembers(brandId);
  const owner = members.find((m) => Number(m.id) === Number(trial?.startedByUserId));
  return {
    Brand: brandId,
    Domain: trial?.emailDomain ?? null,
    Contact: owner?.email ?? null,
    "Credits used": trial ? `${trial.creditsUsed}/${trial.creditsTotal}` : null,
    "Trial ends": trial ? new Date(trial.endsAt).toISOString() : null,
    ...extra,
  };
};

// Signup rejected because the company already has an account — a lead for
// sales (the SLG motion), not a dead end. Once per address.
export const notifySalesDomainConflict = async (email: string): Promise<void> => {
  try {
    const lower = email.toLowerCase();
    await sendSalesAlert(
      JourneySlot.SALES_DOMAIN_CONFLICT,
      `email:${lower}`,
      null,
      `Signup blocked: ${lower.split("@")[1]} already has an account`,
      { Email: lower, Domain: lower.split("@")[1], Action: "Route to the existing account owner or sell a new seat" },
    );
  } catch (err) {
    logger.error("[TrialJourney] Domain-conflict alert failed", { error: (err as Error).message });
  }
};

// ── D0 welcome (transactional — outside the budget) ──────────────────────────

// Sent the moment the trial starts: confirms the account, shows the full
// credit meter and links back in. Fire-and-forget from complete-profile.
export const sendTrialWelcome = (brandId: number): void => {
  (async () => {
    if (!isTrialJourneyEnabled()) return;
    const trial = await findBrandTrial(brandId);
    if (!trial) return;
    const f = await loadFacts(trial);
    if (!f) return;
    await claimAndSend(
      {
        subjectKey: brandKey(brandId),
        slot: JourneySlot.WELCOME,
        brandId,
        userId: f.recipient.id,
        channel: JourneyChannel.EMAIL,
        variant: null,
      },
      async () => T.welcomeEmail(await templateContext(f, null)),
      async (msg) => {
        await sendEmail({ to: f.recipient.email, subject: msg.subject, html: msg.html! });
        return { status: JourneySendStatus.SENT };
      },
    );
  })().catch((err) =>
    logger.error("[TrialJourney] Welcome failed", { brandId, error: (err as Error).message }),
  );
};

// ── Credit exhaustion trigger ────────────────────────────────────────────────

// Called by licensing after every trial credit spent. Fire-and-forget: the
// license response never waits on this.
export const onTrialCreditSpent = (brandId: number, state: TrialStateResponse): void => {
  (async () => {
    await markTrialActivated(brandId);
    if (state.creditsRemaining > 0 || !isTrialJourneyEnabled()) return;
    const trial = await findBrandTrial(brandId);
    if (trial) await runJourneyForTrial(trial, new Date(), { exhausted: true });
  })().catch((err) =>
    logger.error("[TrialJourney] Credit-spent trigger failed", { brandId, error: (err as Error).message }),
  );
};

// ── Day-7 close ──────────────────────────────────────────────────────────────

export const day7SegmentFor = (trial: BrandTrialModel, paid: boolean): Day7Segment => {
  if (paid || trial.status === TrialStatus.CONVERTED) return Day7Segment.PAID;
  if (trial.creditsUsed >= 2) return Day7Segment.CONVERTED;
  if (trial.creditsUsed === 1) return Day7Segment.NEEDS_ASSISTANCE;
  return Day7Segment.NOT_CONVERTED;
};

const closeDay7 = async (now: Date): Promise<number> => {
  const due = await listTrialsDueForDay7(now);
  if (!due.length) return 0;
  const paid = await brandIdsWithTokenAllocations(due.map((t) => Number(t.brandId)));
  let closed = 0;
  for (const trial of due) {
    const brandId = Number(trial.brandId);
    const segment = day7SegmentFor(trial, paid.has(brandId));
    if (!(await setTrialDay7Segment(brandId, segment))) continue;
    closed++;
    // "Needs assistance" goes to a human, not just an automated nudge.
    if (segment === Day7Segment.NEEDS_ASSISTANCE) {
      await sendSalesAlert(
        JourneySlot.SALES_NEEDS_ASSISTANCE,
        brandKey(brandId),
        brandId,
        `Needs assistance: ${trial.emailDomain} used 1 of ${trial.creditsTotal} trial credits`,
        await brandAlertLines(brandId, { Action: "Reach out — offer curated picks / a walkthrough" }),
      );
    }
  }
  return closed;
};

// ── Team invite not accepted in 48h ──────────────────────────────────────────

const runInviteReminders = async (now: Date): Promise<number> => {
  const stale = await listStaleTrialInvites(new Date(now.getTime() - 2 * DAY_MS));
  let sent = 0;
  for (const inv of stale) {
    const status = await claimAndSend(
      {
        subjectKey: `invitee:${inv.inviteeId}`,
        slot: JourneySlot.INVITE_REMINDER,
        brandId: Number(inv.brandId),
        userId: Number(inv.inviterId),
        channel: JourneyChannel.EMAIL,
        variant: null,
      },
      async () => T.inviteReminder(inv.inviterFirstName, inv.inviteeEmail, unsubscribeUrl(inv.inviterEmail)),
      deliverEmail(inv.inviterEmail),
    );
    if (status === JourneySendStatus.SENT) sent++;
  }
  return sent;
};

// ── Pre-trial: onboarding re-trigger (next time → +1 → +2 → end) ─────────────

const RETRIGGER_SLOTS = [
  JourneySlot.ONBOARDING_RETRIGGER_1,
  JourneySlot.ONBOARDING_RETRIGGER_2,
  JourneySlot.ONBOARDING_RETRIGGER_3,
] as const;

const runOnboardingRetriggers = async (now: Date): Promise<number> => {
  // Never reach back past the trial launch: existing users never get trial
  // mail, and without a launch date nobody does.
  const launchedAt = await getTrialLaunchedAt();
  if (!launchedAt) return 0;
  const windowStart = new Date(now.getTime() - 4 * DAY_MS);
  const createdAfter = launchedAt > windowStart ? launchedAt : windowStart;
  const users = await listIncompleteSignups(createdAfter, new Date(now.getTime() - DAY_MS));
  let sent = 0;
  for (const u of users) {
    // Day 1 → attempt 1, day 2 → 2, day 3 → 3 (the last); then they lapse.
    const attempt = Math.min(3, Math.floor((now.getTime() - new Date(u.createdAt).getTime()) / DAY_MS)) as 1 | 2 | 3;
    if (attempt < 1) continue;
    const slot = RETRIGGER_SLOTS[attempt - 1];
    const status = await claimAndSend(
      { subjectKey: `user:${u.id}`, slot, userId: u.id, channel: JourneyChannel.EMAIL, variant: null },
      async (sendId) =>
        T.onboardingRetrigger(
          attempt,
          await createMagicLoginUrl(u.id, u.email, sendId),
          unsubscribeUrl(u.email),
        ),
      deliverEmail(u.email),
    );
    if (status === JourneySendStatus.SENT) sent++;
  }
  return sent;
};

// ── The tick ─────────────────────────────────────────────────────────────────

export interface TrialJourneyTickSummary {
  enabled: boolean;
  trials: number;
  planned: number;
  day7Closed: number;
  inviteReminders: number;
  onboardingRetriggers: number;
}

export const executeTrialJourneyTick = async (now: Date = new Date()): Promise<TrialJourneyTickSummary> => {
  const summary: TrialJourneyTickSummary = {
    enabled: isTrialJourneyEnabled(),
    trials: 0,
    planned: 0,
    day7Closed: 0,
    inviteReminders: 0,
    onboardingRetriggers: 0,
  };
  // The Day-7 close is measurement, not a send: it runs even with the journey
  // off, so the funnel has segments for trials that ran before launch.
  summary.day7Closed = await closeDay7(now);
  if (!summary.enabled) return summary;

  topTracksMemo = null;
  const trials = await listTrialsInJourney(new Date(now.getTime() - (TRIAL_DAYS + 1) * DAY_MS));
  summary.trials = trials.length;
  for (const trial of trials) {
    try {
      summary.planned += await runJourneyForTrial(trial, now);
    } catch (err) {
      logger.error("[TrialJourney] Trial failed", { brandId: trial.brandId, error: (err as Error).message });
    }
  }
  if (isInSendHours(now)) {
    summary.inviteReminders = await runInviteReminders(now);
    // The re-trigger promises a trial on completion — only true while new
    // trials are actually being started.
    if (isSmashTrialEnabled()) summary.onboardingRetriggers = await runOnboardingRetriggers(now);
  }
  return summary;
};

// ── Signals from the FE ──────────────────────────────────────────────────────

export const recordTrialSignalService = async (
  userId: number,
  data: TrialSignalRequestData,
): Promise<void> => {
  const user = await findUserById(userId);
  const brandId = user?.brandId ? Number(user.brandId) : null;
  await createTrialSignal({
    userId,
    brandId,
    kind: data.kind,
    trackCode: data.trackCode ?? null,
    sendId: data.sendId ?? null,
    granted: data.granted ?? null,
  });

  switch (data.kind) {
    case TrialSignalKind.NOTIFICATION_OPENED:
    case TrialSignalKind.NOTIFICATION_CLICKED:
      if (data.sendId) {
        await markSendEngagedById(
          data.sendId,
          userId,
          data.kind === TrialSignalKind.NOTIFICATION_CLICKED ? "click" : "open",
        );
      }
      return;
    case TrialSignalKind.ENTERPRISE_TRACK_GATED_VIEWED: {
      if (!brandId || !isTrialEmail(user?.email)) return;
      const trial = await findBrandTrial(brandId);
      if (!trial || trial.status !== TrialStatus.ACTIVE) return;
      if ((await brandIdsWithTokenAllocations([brandId])).has(brandId)) return; // already paying
      // High intent: alert on the first gated track, escalate on the second
      // distinct one — a real fit problem, not idle browsing.
      const distinct = await countDistinctGatedTracks(brandId);
      const lines = await brandAlertLines(brandId, { Track: data.trackCode ?? null, "Distinct gated tracks": distinct });
      await sendSalesAlert(
        JourneySlot.SALES_ENTERPRISE_WALL,
        brandKey(brandId),
        brandId,
        `Enterprise-only track opened by trial ${trial.emailDomain}`,
        lines,
      );
      if (distinct >= 2) {
        await sendSalesAlert(
          JourneySlot.SALES_ENTERPRISE_WALL_REPEAT,
          brandKey(brandId),
          brandId,
          `ESCALATE: trial ${trial.emailDomain} hit the Enterprise wall on ${distinct} tracks`,
          { ...lines, Action: "Call now — don't wait for the D4 touch" },
        );
      }
      return;
    }
    default:
      return;
  }
};

// SES Open/Click events (configuration set with open/click tracking). Called
// from the SES webhook for every event; a no-op for non-journey mail.
export const recordJourneyEmailEngagement = async (
  messageId: string,
  kind: "open" | "click",
): Promise<void> => {
  await markSendEngagedByMessageId(messageId, kind);
};

// ── Unsubscribe ──────────────────────────────────────────────────────────────

export const unsubscribeFromJourneyService = async (token: string): Promise<string> => {
  let payload: { email?: string; purpose?: string };
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET_KEY as string) as typeof payload;
  } catch {
    throw new AppError("This unsubscribe link is invalid or has expired.", 400);
  }
  if (payload.purpose !== "trial_unsub" || !payload.email) {
    throw new AppError("This unsubscribe link is invalid.", 400);
  }
  // Same suppression list every campaign send checks, so this stops all
  // marketing mail to the address, not only the trial journey.
  await upsertSuppression({
    email: payload.email,
    reason: EmailSuppressionReason.MANUAL,
    detail: "unsubscribed via trial journey email",
  });
  logger.info("[TrialJourney] Unsubscribed", { email: payload.email });
  return payload.email;
};

// ── In-app: GET /user/trial ──────────────────────────────────────────────────

// Tutorial deferral chain: shown on first login; <Skip> defers it to next
// time → +1 day → +2 days (the final nudge) → lapsed.
const tutorialNudge = async (userId: number, now: Date): Promise<TrialNudge | null> => {
  if (await userHasSeenTour(userId, SMASH_APP_TOUR)) return null;
  const skips = await listTutorialSkips(userId);
  const last = skips[skips.length - 1];
  const show = (final = false): TrialNudge => ({
    key: TrialNudgeKey.TUTORIAL,
    data: { skips: skips.length, final },
  });
  switch (skips.length) {
    case 0:
      return show();
    case 1:
      return (await userHasSessionAfter(userId, last)) ? show() : null;
    case 2:
      return now.getTime() >= new Date(last).getTime() + DAY_MS ? show() : null;
    case 3:
      return now.getTime() >= new Date(last).getTime() + 2 * DAY_MS ? show(true) : null;
    default:
      return null; // lapsed
  }
};

const buildNudges = async (
  trial: BrandTrialModel,
  state: TrialStateResponse,
  userId: number,
  now: Date,
): Promise<TrialNudge[]> => {
  const brandId = Number(trial.brandId);
  const elapsed = now.getTime() - new Date(trial.startedAt).getTime();
  const used = state.creditsTotal - state.creditsRemaining;
  const [tutorial, licenses, instagram, draft] = await Promise.all([
    tutorialNudge(userId, now),
    listTrialLicenses(brandId),
    elapsed >= 2 * DAY_MS ? findBrandInstagram(brandId) : Promise.resolve("n/a"),
    findAbandonedSoundProject([userId], new Date(now.getTime() - DAY_MS)),
  ]);
  const nudges: TrialNudge[] = [];
  if (tutorial) nudges.push(tutorial);

  const unlinked = licenses.filter(
    (l) => l.videoLinks === 0 && now.getTime() - new Date(l.createdAt).getTime() >= DAY_MS,
  );
  if (unlinked.length) {
    nudges.push({
      key: TrialNudgeKey.USAGE_LINK_MISSING,
      data: { licenseIds: unlinked.map((l) => l.id), trackCodes: unlinked.map((l) => l.trackCode) },
    });
  }
  if (elapsed >= 3 * DAY_MS && used >= 1 && state.creditsRemaining > 0) {
    nudges.push({
      key: TrialNudgeKey.SECOND_LICENSE_PICKS,
      data: { basedOnTrackCodes: licenses.map((l) => l.trackCode) },
    });
  }
  if (!instagram) nudges.push({ key: TrialNudgeKey.PROFILE_INSTAGRAM });
  if (draft) {
    nudges.push({ key: TrialNudgeKey.SOUND_TRACKING_RESUME, data: { projectId: draft.id, name: draft.name } });
  }
  if (elapsed >= 6 * DAY_MS && used >= 2 && state.creditsRemaining > 0) {
    nudges.push({ key: TrialNudgeKey.SOFT_UPSELL, data: { creditsUsed: used, creditsTotal: state.creditsTotal } });
  }
  if (state.creditsRemaining === 0 || (elapsed >= 6 * DAY_MS && used >= 2)) {
    nudges.push({
      key: TrialNudgeKey.CONVERSION_MODAL,
      data: { reason: state.creditsRemaining === 0 ? "credits_exhausted" : "day_7", creditsUsed: used },
    });
  }
  return nudges;
};

const toInboxItem = (s: TrialJourneySendModel): TrialInboxItem => ({
  sendId: s.id,
  slot: s.slot as JourneySlot,
  title: s.title ?? "",
  body: s.body ?? "",
  url: s.url ?? frontendUrl(),
  sentAt: s.sentAt ?? s.createdAt,
});

export const getTrialWithNudgesService = async (
  userId: number,
  brandId: number | null | undefined,
  email: string | null | undefined,
): Promise<TrialWithNudgesResponse> => {
  const empty: TrialWithNudgesResponse = { trial: null, nudges: [], inbox: [] };
  // Personal-email users never see the trial, even inside a trial brand.
  if (!brandId || !isTrialEmail(email)) return empty;
  const trial = await findBrandTrial(Number(brandId));
  if (!trial) return empty;
  const converted = (await brandIdsWithTokenAllocations([Number(brandId)])).has(Number(brandId));
  const now = new Date();
  const state = resolveTrialState(trial, converted, now);
  if (state.planType === "PAID") return { trial: state, nudges: [], inbox: [] };

  // Polling the meter after onboarding is itself a return visit.
  if (!trial.activatedAt && now.getTime() - new Date(trial.startedAt).getTime() >= ACTIVATION_GRACE_MS) {
    await markTrialActivated(Number(brandId), now);
  }
  const [nudges, pushes] = await Promise.all([
    buildNudges(trial, state, userId, now),
    listPushSendsForBrand(Number(brandId)),
  ]);
  return { trial: state, nudges, inbox: pushes.map(toInboxItem) };
};

// ── Admin ────────────────────────────────────────────────────────────────────

export const listJourneySendsService = async (brandId: number) => {
  const sends = await findSendsBySubject(brandKey(brandId));
  return sends.map((s) => ({
    id: s.id,
    slot: s.slot,
    channel: s.channel,
    variant: s.variant,
    status: s.status,
    title: s.title,
    url: s.url,
    error: s.error,
    sentAt: s.sentAt,
    openedAt: s.openedAt,
    clickedAt: s.clickedAt,
    createdAt: s.createdAt,
  }));
};

// Day-7 measurement, computed server-side from the DB (no daily event needed).
// Stage definitions follow the journey doc; drop-off = (n − n+1) ÷ n.
export const getTrialFunnelService = async (from: Date, to: Date): Promise<TrialFunnelResponse> => {
  const rows = await listFunnelTrials(from, to);
  const now = Date.now();
  const within7 = (start: Date, at: Date | null) =>
    !!at && new Date(at).getTime() < new Date(start).getTime() + TRIAL_DAYS * DAY_MS;

  const counts = [
    rows.length,
    rows.filter((r) => within7(r.startedAt, r.activatedAt) || r.licenses7d > 0).length,
    rows.filter((r) => r.licenses7d >= 1).length,
    rows.filter((r) => r.licenses7d >= 2).length,
    rows.filter((r) => r.licenses7d >= 3).length,
    rows.filter((r) => r.paid7d).length,
  ];
  const names = [
    "Signed up",
    "Logged in by D7",
    "Licensed ≥ 1 track",
    "Converted (≥ 2 credits used)",
    "Exhausted 3/3 credits",
    "Paid conversion",
  ];
  const stages: FunnelStage[] = names.map((name, i) => ({
    stage: i + 1,
    name,
    users: counts[i],
    dropOffToNext:
      i < names.length - 1 && counts[i] > 0 ? Number(((counts[i] - counts[i + 1]) / counts[i]).toFixed(4)) : null,
  }));

  const segments = {
    [Day7Segment.PAID]: 0,
    [Day7Segment.CONVERTED]: 0,
    [Day7Segment.NEEDS_ASSISTANCE]: 0,
    [Day7Segment.NOT_CONVERTED]: 0,
  } as Record<Day7Segment, number>;
  for (const r of rows) {
    if (r.day7Segment && r.day7Segment in segments) segments[r.day7Segment as Day7Segment]++;
  }
  const bySignupSource: Record<string, number> = {};
  for (const r of rows) {
    const k = r.signupSource ?? "unknown";
    bySignupSource[k] = (bySignupSource[k] ?? 0) + 1;
  }

  return {
    from: from.toISOString(),
    to: to.toISOString(),
    stillRunning: rows.filter((r) => new Date(r.startedAt).getTime() + TRIAL_DAYS * DAY_MS > now).length,
    stages,
    conversionRate: rows.length ? Number((counts[3] / rows.length).toFixed(4)) : null,
    segments,
    exhaustedWithUsageLink: rows.filter((r) => r.licenses7d >= 3 && r.licensesWithLink7d >= 1).length,
    bySignupSource,
  };
};
