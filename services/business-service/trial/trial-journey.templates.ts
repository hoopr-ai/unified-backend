// Copy for every trial-journey touch. Kept apart from the decision logic so
// marketing can rewrite a line without touching when it fires.
//
// Emails share the layout of the existing transactional mails in
// helper-service/email.service.ts (logo, pink CTA), plus an unsubscribe footer:
// unlike those, journey mails are marketing and must carry one.

import {
  JourneyChannel,
  JourneySlot,
  JourneyVariant,
  type JourneyMessage,
} from "../../dto-service/modules.export";
import { frontendUrl } from "./magic-link.service";

const esc = (v: string): string =>
  v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const P = (html: string) =>
  `<p style="margin:0 0 16px 0; font-size:15px; color:#333; line-height:1.7;">${html}</p>`;

const button = (href: string, label: string) => `
  <a href="${esc(href)}"
     style="display:inline-block; background-color:#ff2f63; color:#ffffff;
            text-decoration:none; padding:14px 36px; font-size:16px;
            border-radius:6px; font-weight:600;">${esc(label)}</a>`;

const layout = (title: string, inner: string, cta: string, unsubscribeUrl: string | null) => `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8" /><title>${esc(title)}</title></head>
<body style="margin:0; padding:0; background-color:#f4f4f4; font-family: Arial, Helvetica, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f4; padding:30px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff; border-radius:8px; overflow:hidden; box-shadow:0 2px 6px rgba(0,0,0,0.08);">
        <tr><td align="center" style="padding:30px 20px 10px 20px;">
          <img src="https://storage.googleapis.com/cdn-hooprsmash-com-prod/enterprise/web/logos/HooprSmash.png" alt="Hoopr" style="max-width:150px; height:auto; display:block;" />
        </td></tr>
        <tr><td align="center" style="padding:10px 40px;">
          <h1 style="margin:0; font-size:26px; color:#1a1a1a;">${esc(title)}</h1>
        </td></tr>
        <tr><td style="padding:20px 40px 10px 40px;">${inner}</td></tr>
        <tr><td align="center" style="padding:10px 40px 20px 40px;">${cta}</td></tr>
        <tr><td style="padding:0 40px 25px 40px;">
          ${P(`Need a hand? Write to us at <a href="mailto:hello@hoopr.ai" style="color:#ff2f63; text-decoration:none;">hello@hoopr.ai</a>.`)}
          <p style="margin:0; font-size:15px; color:#333; line-height:1.7;">Regards,<br/>Team Hoopr</p>
        </td></tr>
      </table>
      <table width="600" cellpadding="0" cellspacing="0">
        <tr><td align="center" style="padding:20px; font-size:12px; color:#aaa;">
          ${unsubscribeUrl
            ? `You're receiving this because you started a Hoopr Smash trial. <a href="${esc(unsubscribeUrl)}" style="color:#aaa;">Unsubscribe</a>`
            : "This is an automated email. Please do not reply."}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

const formatDate = (d: Date): string =>
  new Intl.DateTimeFormat("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "Asia/Kolkata",
  }).format(d);

export interface TemplateContext {
  creditsRemaining: number;
  creditsTotal: number;
  trialEnd: Date;
}

const email = (
  slot: JourneySlot,
  variant: JourneyVariant | null,
  subject: string,
  title: string,
  inner: string,
  ctaUrl: string,
  ctaLabel: string,
  unsubscribeUrl: string | null,
): JourneyMessage => ({
  slot,
  channel: JourneyChannel.EMAIL,
  variant,
  subject,
  body: title,
  url: ctaUrl,
  html: layout(title, inner, button(ctaUrl, ctaLabel), unsubscribeUrl),
});

const push = (
  slot: JourneySlot,
  variant: JourneyVariant | null,
  title: string,
  body: string,
  path: string,
): JourneyMessage => ({
  slot,
  channel: JourneyChannel.PUSH,
  variant,
  subject: title,
  body,
  url: `${frontendUrl()}${path}`,
});

// ── Trial days: one copy, sent as a push and as an email ─────────────────────
// Product copy: "credits", never "tokens" (matches the header chip and
// popover). Push titles ≤ ~45 chars and bodies ≤ ~120 — Chrome truncates. The
// email carries the same title and text, plus a greeting and a button.

export interface DayCopy {
  variant: JourneyVariant;
  title: string;
  body: string;
  path: string;
  cta: string;
}

const creditWord = (n: number) => `${n} credit${n === 1 ? "" : "s"}`;

// Day 1
export const welcomeCopy = (ctx: TemplateContext): DayCopy => ({
  variant: JourneyVariant.STANDARD,
  title: "Your trial is live",
  body: `${creditWord(ctx.creditsTotal)} are on your account — one each for Hoopr Originals, International and Regional & Indie.`,
  path: "/home",
  cta: "Start exploring",
});

// Day 2
export const firstTrackCopy = (): DayCopy => ({
  variant: JourneyVariant.STANDARD,
  title: "Pick your first track",
  body: "Spend a credit on any track and the licence comes with it, ready to publish.",
  path: "/recommended",
  cta: "Pick a track",
});

// Day 3
export const exploreCopy = (): DayCopy => ({
  variant: JourneyVariant.STANDARD,
  title: "New tracks worth a listen",
  body: "Browse the catalogue and download anything your credits cover.",
  path: "/recommended",
  cta: "Browse tracks",
});

// Day 4 — an unfinished Sound Tracking draft when there is one; otherwise the
// credits left, and nothing at all once they are 0.
export const resumeCopy = (
  ctx: TemplateContext,
  draft: { id: string; name: string } | null,
): DayCopy | null => {
  if (draft) {
    return {
      variant: JourneyVariant.SOUND_TRACKING_RESUME,
      title: "Your project is still open",
      body: `"${draft.name}" is one step from a finished soundtrack.`,
      path: `/sound-tracking/editor?projectId=${encodeURIComponent(draft.id)}&source=resume`,
      cta: "Open project",
    };
  }
  if (ctx.creditsRemaining === 0) return null;
  return {
    variant: JourneyVariant.CREDITS_REMAINING,
    title: "Pick up where you left off",
    body: `You have ${creditWord(ctx.creditsRemaining)} left, and your trial runs until ${formatDate(ctx.trialEnd)}.`,
    path: "/recommended",
    cta: "Continue",
  };
};

// Day 6 (the slot window is Day 6 only, so "tomorrow" holds)
export const contactSalesCopy = (): DayCopy => ({
  variant: JourneyVariant.STANDARD,
  title: "Your trial ends tomorrow",
  body: "Talk to us about keeping access to the catalogue.",
  path: "/contact-us?source=trial",
  cta: "Talk to us",
});

export const asPush = (slot: JourneySlot, c: DayCopy): JourneyMessage =>
  push(slot, c.variant, c.title, c.body, c.path);

// Rendered per recipient: the greeting and the unsubscribe link are personal.
export const asEmail = (
  slot: JourneySlot,
  c: DayCopy,
  to: { firstName: string | null; unsubscribeUrl: string | null },
): JourneyMessage =>
  email(
    slot,
    c.variant,
    c.title,
    c.title,
    P(`Hey ${esc(to.firstName || "there")},`) + P(esc(c.body)),
    `${frontendUrl()}${c.path}`,
    c.cta,
    to.unsubscribeUrl,
  );

// ── Paid credits added (any brand, outside the trial journey) ────────────────

export const paidCreditsCopy = (grant: { type: string; tokens: number; isUnlimited: boolean }) => ({
  title: "Credits added to your account",
  body: grant.isUnlimited
    ? `Unlimited ${grant.type} credits are now on your account.`
    : `${grant.tokens} ${grant.type} credit${grant.tokens === 1 ? " is" : "s are"} ready to use.`,
  path: "/home",
  cta: "Start licensing",
});

// Transactional (the brand just bought credits), so no unsubscribe footer.
export const paidCreditsEmailHtml = (
  c: ReturnType<typeof paidCreditsCopy>,
  firstName: string | null,
): string =>
  layout(
    c.title,
    P(`Hey ${esc(firstName || "there")},`) + P(esc(c.body)),
    button(`${frontendUrl()}${c.path}`, c.cta),
    null,
  );

// ── Pre-trial: onboarding re-trigger (outside the budget) ────────────────────

export const onboardingRetrigger = (
  attempt: 1 | 2 | 3,
  magicLinkUrl: string,
  unsubscribeUrl: string,
): JourneyMessage => {
  const slot = [
    JourneySlot.ONBOARDING_RETRIGGER_1,
    JourneySlot.ONBOARDING_RETRIGGER_2,
    JourneySlot.ONBOARDING_RETRIGGER_3,
  ][attempt - 1];
  const last = attempt === 3;
  return email(
    slot,
    null,
    last ? "Last reminder: finish setting up Hoopr Smash" : "Finish setting up your Hoopr Smash account",
    "You're one step away",
    P("Hey there,") +
      P("You started signing up for Hoopr Smash but didn't finish. Tell us your name, your brand and the music you like, and your 7-day trial with 3 free credits starts right away.") +
      (last ? P("This is the last reminder we'll send.") : ""),
    magicLinkUrl,
    "Finish setting up",
    unsubscribeUrl,
  );
};

// ── Team invite not accepted in 48h — to the inviter ─────────────────────────

export const inviteReminder = (
  inviterFirstName: string | null,
  inviteeEmail: string,
  unsubscribeUrl: string,
): JourneyMessage =>
  email(
    JourneySlot.INVITE_REMINDER,
    null,
    `${inviteeEmail} hasn't joined your team yet`,
    "Your teammate hasn't joined yet",
    P(`Hey ${esc(inviterFirstName || "there")},`) +
      P(`You invited <strong>${esc(inviteeEmail)}</strong> to your Hoopr Smash team two days ago, and they haven't joined yet. A quick nudge from you usually does it — or resend the invite from My Team.`),
    `${frontendUrl()}/my-team`,
    "Open My Team",
    unsubscribeUrl,
  );

// ── Internal sales alerts ────────────────────────────────────────────────────

export const salesAlert = (slot: JourneySlot, subject: string, lines: Record<string, string | number | null>): JourneyMessage => {
  const rows = Object.entries(lines)
    .map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0; color:#666;">${esc(k)}</td><td style="padding:4px 0;">${esc(String(v ?? "—"))}</td></tr>`)
    .join("");
  return {
    slot,
    channel: JourneyChannel.INTERNAL,
    variant: null,
    subject: `[Smash trial] ${subject}`,
    body: subject,
    url: "",
    html: `<div style="font-family:Arial,Helvetica,sans-serif; font-size:14px; color:#222;">
      <p style="margin:0 0 12px 0;"><strong>${esc(subject)}</strong></p>
      <table cellpadding="0" cellspacing="0">${rows}</table>
    </div>`,
  };
};
