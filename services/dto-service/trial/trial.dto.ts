import { OwnerType } from "../rail/rail.enum";

// Smash 7-day trial — shared constants, enums and response shapes.
//
// The trial is a plan of its own, NOT a Business Pro allocation: it lives in
// brand_trials (one row per brand), outside token_assigned. A brand leaves the
// trial the moment it gets any token_assigned row; see resolveTrialState for
// the precedence.

// Token types the trial covers, each with its own credits: a credit of one type
// licenses only tracks of that type. Chartbusters is never on the trial.
export const TRIAL_CREDIT_TYPES: readonly string[] = [
  OwnerType.INTERNATIONAL,
  OwnerType.REGIONAL_AND_INDIE,
  OwnerType.HOOPR_ORIGINALS,
];
// Default trial size per type. The one-time extension adds
// TRIAL_EXTENSION_CREDITS_PER_TYPE to every type on top and never changes it.
export const TRIAL_CREDITS_PER_TYPE = 1;
export const TRIAL_EXTENSION_CREDITS_PER_TYPE = 1;
// Totals across the types (creditsTotal on a fresh / extended trial).
export const TRIAL_CREDITS = TRIAL_CREDITS_PER_TYPE * TRIAL_CREDIT_TYPES.length;
export const TRIAL_EXTENSION_CREDITS = TRIAL_EXTENSION_CREDITS_PER_TYPE * TRIAL_CREDIT_TYPES.length;
export const TRIAL_DAYS = 7;
// Hours after day 7 during which unused credits still work. 0 = forfeited at
// the stroke of day 7 (open product question; flip this, not the queries).
export const TRIAL_GRACE_HOURS = 0;

export const DAY_MS = 24 * 60 * 60 * 1000;

// Master switch. Off: signup is ungated and no new trials start. Existing
// trial rows keep working either way, so turning it off never strands a brand
// mid-trial.
export const isSmashTrialEnabled = (): boolean =>
  process.env.SMASH_TRIAL_ENABLED === "true";

export enum TrialStatus {
  ACTIVE = "ACTIVE",
  // Set when the brand buys a plan; also inferred on read from token_assigned.
  CONVERTED = "CONVERTED",
}

// Why licensing is behind the upgrade wall. Lower-case on purpose: these are
// the values the FE and the analytics events carry verbatim.
export enum TrialBlockReason {
  TRIAL_EXPIRED = "trial_expired",
  CREDITS_EXHAUSTED = "credits_exhausted",
}

// errorCode of the 403 when the track's type has no trial credit left but
// other types still do — not an upgrade wall, the trial stays usable.
export const TYPE_CREDITS_EXHAUSTED = "type_credits_exhausted";

// Returned as `error.errorCode` from POST /user/send-email-otp.
export enum SignupRejectReason {
  // No longer thrown: personal addresses sign up normally, just without a
  // trial. Kept so FE code that still references it compiles.
  PERSONAL_EMAIL = "personal_email",
  DOMAIN_EXISTS = "domain_exists",
}

export enum CategoryPreference {
  INDIE_REGIONAL = "indie_regional",
  HOOPR_OG = "hoopr_og",
  INTL_SONGS = "intl_songs",
}

export enum DiscoveryChannel {
  SALES_LED = "sales_led",
  SAGE_UPSELL = "sage_upsell",
  SAGE_PAID_REPORT = "sage_paid_report",
  LANDING_PLG = "landing_plg",
}

// B2B-only gate: addresses on these domains can never start a trial. Exact
// match on the part after "@", so "gmail.com" does not catch "notgmail.com".
export const PERSONAL_EMAIL_DOMAINS: ReadonlySet<string> = new Set([
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "yahoo.co.in",
  "yahoo.in",
  "ymail.com",
  "rocketmail.com",
  "hotmail.com",
  "outlook.com",
  "outlook.in",
  "live.com",
  "live.in",
  "msn.com",
  "icloud.com",
  "me.com",
  "mac.com",
  "aol.com",
  "proton.me",
  "protonmail.com",
  "pm.me",
  "rediffmail.com",
  "gmx.com",
  "gmx.net",
  "mail.com",
  "yandex.com",
  "zohomail.in",
  "tutanota.com",
]);

export const isPersonalEmailDomain = (domain: string): boolean =>
  PERSONAL_EMAIL_DOMAINS.has(domain.trim().toLowerCase());

export interface TrialStateResponse {
  // TRIAL while the brand is on the trial, PAID once it has bought anything.
  planType: "TRIAL" | "PAID";
  // Totals across every type (the sum of creditsByType).
  creditsTotal: number;
  creditsRemaining: number;
  // One entry per TRIAL_CREDIT_TYPES type; a credit only licenses its type.
  creditsByType: TrialTypeCredits[];
  trialStart: Date;
  trialEnd: Date;
  daysLeft: number;
  // 1-based day of the trial (day 1 = the first 24h); capped at TRIAL_DAYS + 1.
  trialDay: number;
  isExtended: boolean;
  // Upgrade wall. Always false for PAID.
  licensingBlocked: boolean;
  blockedReason: TrialBlockReason | null;
}

export interface TrialTypeCredits {
  type: string;
  creditsTotal: number;
  creditsRemaining: number;
}

export interface OnboardingResponse {
  categoryPreferences: CategoryPreference[];
  discoveryChannel: DiscoveryChannel | null;
}

export interface AdminTrialListItem extends TrialStateResponse {
  brandId: number;
  brandName: string | null;
  emailDomain: string;
  startedByUserId: number;
  extendedAt: Date | null;
  extendedById: number | null;
}
