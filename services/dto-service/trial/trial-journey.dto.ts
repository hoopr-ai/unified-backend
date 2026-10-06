// Smash 7-day trial — conversion journey (step 2): the 3 email + 5 push
// budget, in-app nudges, sales-assist alerts and Day-7 measurement.
//
// Mixpanel stays with the FE. The backend keeps only the state the journey
// itself has to decide on: what was sent (trial_journey_sends) and the few
// FE-only signals it routes on (trial_signals).

import type { TrialStateResponse } from "./trial.dto";

// Master switch for every outbound journey send (emails, pushes, onboarding
// re-triggers, invite reminders, sales alerts). Separate from
// SMASH_TRIAL_ENABLED so the trial can run before the journey is switched on.
export const isTrialJourneyEnabled = (): boolean =>
  process.env.SMASH_TRIAL_JOURNEY_ENABLED === "true";

// The budget: at most 3 emails and 5 pushes per trial. Everything else is
// in-app (uncounted), transactional (D0 welcome), pre-trial (onboarding
// re-trigger) or aimed at someone else (invite reminder, sales alerts).
export enum JourneySlot {
  WELCOME = "welcome", // D0, transactional — outside the budget
  EMAIL_1 = "email_1", // D1, conditional
  EMAIL_2 = "email_2", // D4, standard
  EMAIL_3 = "email_3", // D5, conditional, 2 days before expiry
  // The 5 trial pushes, by trial day (Day 1 = the day the trial starts).
  PUSH_WELCOME = "push_welcome", // Day 1
  PUSH_CREDITS_ADDED = "push_credits_added", // Day 2
  PUSH_EXPLORE = "push_explore", // Day 3
  PUSH_RESUME = "push_resume", // Day 4
  PUSH_CONTACT_SALES = "push_contact_sales", // Day 6
  ONBOARDING_RETRIGGER_1 = "onboarding_retrigger_1",
  ONBOARDING_RETRIGGER_2 = "onboarding_retrigger_2",
  ONBOARDING_RETRIGGER_3 = "onboarding_retrigger_3",
  INVITE_REMINDER = "invite_reminder",
  SALES_ENTERPRISE_WALL = "sales_enterprise_wall",
  SALES_ENTERPRISE_WALL_REPEAT = "sales_enterprise_wall_repeat",
  SALES_NEEDS_ASSISTANCE = "sales_needs_assistance",
  SALES_DOMAIN_CONFLICT = "sales_domain_conflict",
}

export const BUDGET_EMAIL_SLOTS = [
  JourneySlot.EMAIL_1,
  JourneySlot.EMAIL_2,
  JourneySlot.EMAIL_3,
] as const;
export const BUDGET_PUSH_SLOTS = [
  JourneySlot.PUSH_WELCOME,
  JourneySlot.PUSH_CREDITS_ADDED,
  JourneySlot.PUSH_EXPLORE,
  JourneySlot.PUSH_RESUME,
  JourneySlot.PUSH_CONTACT_SALES,
] as const;

export enum JourneyChannel {
  EMAIL = "email",
  PUSH = "push",
  INTERNAL = "internal", // sales alert to the team, never the trial user
}

export enum JourneySendStatus {
  // Claimed, not yet handed to the provider. A row stuck here means the process
  // died mid-send; it is never retried (at-most-once beats a double send).
  PENDING = "pending",
  SENT = "sent",
  // Push accepted by OneSignal but reached no subscribed device.
  UNDELIVERED = "undelivered",
  // Slot passed on purpose (suppressed address, provider not configured, …).
  SKIPPED = "skipped",
  FAILED = "failed",
}

// Which branch of a conditional slot went out. Stored on the send row so the
// Day-7 report can split by it.
export enum JourneyVariant {
  ACTIVATED = "activated",
  NOT_ACTIVATED = "not_activated",
  STANDARD = "standard",
  SOUND_TRACKING_RESUME = "sound_tracking_resume",
  CREDITS_REMAINING = "credits_remaining",
  CONVERTED = "converted",
  NEEDS_ASSISTANCE = "needs_assistance",
  NOT_CONVERTED = "not_converted",
  EXHAUSTED = "exhausted",
}

// FE-reported signals the backend cannot see on its own. Values are the
// Mixpanel event names, so both sides speak the same vocabulary.
export enum TrialSignalKind {
  ENTERPRISE_TRACK_GATED_VIEWED = "enterprise_track_gated_viewed",
  TUTORIAL_SKIP_CLICKED = "tutorial_skip_clicked",
  PUSH_PERMISSION = "push_permission",
  NOTIFICATION_OPENED = "notification_opened",
  NOTIFICATION_CLICKED = "notification_clicked",
  UPGRADE_CTA_CLICKED = "upgrade_cta_clicked",
}

// Day-7 outcome, by credits used in the 7 days.
export enum Day7Segment {
  PAID = "paid", // bought a plan inside the window
  CONVERTED = "converted", // ≥ 2 credits
  NEEDS_ASSISTANCE = "needs_assistance", // exactly 1
  NOT_CONVERTED = "not_converted", // 0
}

// In-app nudges returned on GET /user/trial. None of these count against the
// 3 + 3 budget. The FE renders one of each key at most.
export enum TrialNudgeKey {
  TUTORIAL = "tutorial",
  USAGE_LINK_MISSING = "usage_link_missing",
  SECOND_LICENSE_PICKS = "second_license_picks",
  PROFILE_INSTAGRAM = "profile_instagram",
  SOUND_TRACKING_RESUME = "sound_tracking_resume",
  SOFT_UPSELL = "soft_upsell",
  CONVERSION_MODAL = "conversion_modal",
}

export interface TrialNudge {
  key: TrialNudgeKey;
  // Free-form per key; documented in docs/SMASH-TRIAL.md.
  data?: Record<string, unknown>;
}

// A push-slot copy kept for the in-app inbox: the in-app fallback for users
// who never granted (or later revoked) push permission.
export interface TrialInboxItem {
  sendId: number;
  slot: JourneySlot;
  title: string;
  body: string;
  url: string;
  sentAt: Date;
}

export interface TrialWithNudgesResponse {
  trial: TrialStateResponse | null;
  nudges: TrialNudge[];
  inbox: TrialInboxItem[];
}

export interface TrialSignalRequestData {
  kind: TrialSignalKind;
  trackCode?: string;
  granted?: boolean;
  sendId?: number;
}

// Rendered copy for one send; push uses title/body/url, email subject/html.
export interface JourneyMessage {
  slot: JourneySlot;
  channel: JourneyChannel;
  variant: JourneyVariant | null;
  subject: string;
  body: string;
  url: string;
  html?: string;
}

export interface FunnelStage {
  stage: number;
  name: string;
  users: number;
  // (stage n − stage n+1) ÷ stage n, for the step INTO the next stage; null on
  // the last stage or when this stage is empty.
  dropOffToNext: number | null;
}

export interface TrialFunnelResponse {
  from: string;
  to: string;
  // Trials whose 7 days are not over yet; their numbers can still move.
  stillRunning: number;
  stages: FunnelStage[];
  conversionRate: number | null;
  segments: Record<Day7Segment, number>;
  // Of the exhausted (stage 5), how many added a usage link at least once.
  exhaustedWithUsageLink: number;
  bySignupSource: Record<string, number>;
}
