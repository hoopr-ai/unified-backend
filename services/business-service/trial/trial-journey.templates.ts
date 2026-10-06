// Copy for every trial-journey touch. Kept apart from the decision logic so
// marketing can rewrite a line without touching when it fires.
//
// Emails share the layout of the existing transactional mails in
// helper-service/email.service.ts (logo, pink CTA), plus an unsubscribe footer:
// unlike those, journey mails are marketing and must carry one.

import {
  CategoryPreference,
  JourneyChannel,
  JourneySlot,
  JourneyVariant,
  type JourneyMessage,
} from "../../dto-service/modules.export";
import type { TopTrackRow } from "../../persistence-service/trial/modules.export";
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

const CATEGORY_LINKS: Record<CategoryPreference, { label: string; path: string }> = {
  [CategoryPreference.INDIE_REGIONAL]: { label: "Indie & Regional", path: "/regional-indie" },
  [CategoryPreference.HOOPR_OG]: { label: "Hoopr OG", path: "/hoopr-originals" },
  [CategoryPreference.INTL_SONGS]: { label: "International", path: "/international" },
};

const formatDate = (d: Date): string =>
  new Intl.DateTimeFormat("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "Asia/Kolkata",
  }).format(d);

const credits = (n: number) => `${n} free credit${n === 1 ? "" : "s"}`;

export interface TemplateContext {
  firstName: string | null;
  creditsRemaining: number;
  creditsTotal: number;
  creditsUsed: number;
  trialEnd: Date;
  categories: CategoryPreference[];
  // Present only for the not-activated lane.
  magicLinkUrl: string | null;
  unsubscribeUrl: string | null;
}

const hello = (ctx: TemplateContext) => P(`Hey ${esc(ctx.firstName || "there")},`);

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

// ── D0 — transactional, outside the budget ───────────────────────────────────

export const welcomeEmail = (ctx: TemplateContext): JourneyMessage =>
  email(
    JourneySlot.WELCOME,
    null,
    "Your Hoopr Smash trial has started",
    `${ctx.creditsTotal}/${ctx.creditsTotal} credits available`,
    hello(ctx) +
      P(`Your 7-day Hoopr Smash trial is live. You have <strong>${credits(ctx.creditsTotal)}</strong> to license tracks for your content, until <strong>${formatDate(ctx.trialEnd)}</strong>.`) +
      P("Browse, preview, license — and add the link to the post where you used the track so the license is complete."),
    `${frontendUrl()}/home`,
    "Start exploring",
    null,
  );

// ── Email 1 (D1) — conditional ───────────────────────────────────────────────

export const email1 = (ctx: TemplateContext, activated: boolean): JourneyMessage => {
  const picks = ctx.categories.length
    ? P(
        "Start with what you told us you like: " +
          ctx.categories
            .map((c) => CATEGORY_LINKS[c])
            .filter(Boolean)
            .map((c) => `<a href="${frontendUrl()}${c.path}" style="color:#ff2f63; text-decoration:none;">${c.label}</a>`)
            .join(" · "),
      )
    : "";
  const tips =
    P("<strong>The best ways to use Hoopr Smash:</strong>") +
    P("1. <strong>Search by mood, genre or occasion</strong> and preview tracks right on the page.<br/>" +
      "2. <strong>Favourite the tracks you like</strong> and set your category preferences — <em>Recommended for you</em> gets sharper with every one.<br/>" +
      "3. <strong>License, download, then add your usage link</strong> once the post is live.") +
    picks;

  if (activated) {
    return email(
      JourneySlot.EMAIL_1,
      JourneyVariant.ACTIVATED,
      "3 ways to get more out of Hoopr Smash",
      "Make Hoopr Smash yours",
      hello(ctx) + tips + P(`You have <strong>${credits(ctx.creditsRemaining)}</strong> left in your trial.`),
      `${frontendUrl()}/recommended`,
      "See what's recommended for you",
      ctx.unsubscribeUrl,
    );
  }
  return email(
    JourneySlot.EMAIL_1,
    JourneyVariant.NOT_ACTIVATED,
    `Your ${credits(ctx.creditsRemaining)} are waiting`,
    `Your ${credits(ctx.creditsRemaining)} are waiting`,
    hello(ctx) +
      P(`You haven't used your trial yet — <strong>${credits(ctx.creditsRemaining)}</strong> are ready for your next post. One click below logs you straight in.`) +
      tips,
    ctx.magicLinkUrl ?? `${frontendUrl()}/login`,
    "Log in with one click",
    ctx.unsubscribeUrl,
  );
};

// ── Email 2 (D4) — standard, same for everyone ───────────────────────────────

export const email2 = (ctx: TemplateContext, topTracks: TopTrackRow[]): JourneyMessage => {
  const list = topTracks.length
    ? `<ol style="margin:0 0 16px 20px; padding:0; font-size:15px; color:#333; line-height:1.9;">${topTracks
        .map((t) => `<li><a href="${frontendUrl()}/tracks/${encodeURIComponent(t.trackCode)}" style="color:#ff2f63; text-decoration:none;">${esc(t.name)}</a></li>`)
        .join("")}</ol>`
    : "";
  return email(
    JourneySlot.EMAIL_2,
    JourneyVariant.STANDARD,
    "Have you checked out the top 5 most downloaded tracks?",
    "The 5 most downloaded tracks right now",
    hello(ctx) + P("These are the tracks creators and brands are licensing most on Hoopr Smash right now:") + list,
    `${frontendUrl()}/trending`,
    "See what's trending",
    ctx.unsubscribeUrl,
  );
};

// ── Email 3 (D5) — conditional, 2 days before expiry ─────────────────────────

export const email3 = (ctx: TemplateContext, activated: boolean): JourneyMessage => {
  const subject = `Your trial expires on ${formatDate(ctx.trialEnd)}`;
  const status = P(
    ctx.creditsRemaining > 0
      ? `You still have <strong>${credits(ctx.creditsRemaining)}</strong>. Unused credits expire with the trial.`
      : `You've used all ${ctx.creditsTotal} trial credits — upgrade to keep licensing.`,
  );
  if (activated) {
    return email(
      JourneySlot.EMAIL_3,
      JourneyVariant.ACTIVATED,
      subject,
      subject,
      hello(ctx) + status + P("Upgrade to Business Pro to keep licensing once the trial ends."),
      ctx.creditsRemaining > 0 ? `${frontendUrl()}/recommended` : `${frontendUrl()}/my-subscription`,
      ctx.creditsRemaining > 0 ? "Use my credits" : "See plans",
      ctx.unsubscribeUrl,
    );
  }
  return email(
    JourneySlot.EMAIL_3,
    JourneyVariant.NOT_ACTIVATED,
    subject,
    subject,
    hello(ctx) + status + P("This is the last reminder we'll send. One click below logs you straight in."),
    ctx.magicLinkUrl ?? `${frontendUrl()}/login`,
    "Log in with one click",
    ctx.unsubscribeUrl,
  );
};

// ── Trial pushes (Day 1 = the day the trial starts) ──────────────────────────
// Product copy: "credits", never "tokens" (matches the header chip and
// popover). Keep titles ≤ ~45 chars and bodies ≤ ~120 — Chrome truncates.

const creditWord = (n: number) => `${n} credit${n === 1 ? "" : "s"}`;

// Day 1
export const pushWelcome = (ctx: TemplateContext): JourneyMessage =>
  push(
    JourneySlot.PUSH_WELCOME,
    JourneyVariant.STANDARD,
    "Your trial is live",
    `${creditWord(ctx.creditsTotal)} are on your account — one each for Hoopr Originals, International and Regional & Indie.`,
    "/home",
  );

// Day 2
export const pushCreditsAdded = (): JourneyMessage =>
  push(
    JourneySlot.PUSH_CREDITS_ADDED,
    JourneyVariant.STANDARD,
    "Pick your first track",
    "Spend a credit on any track and the licence comes with it, ready to publish.",
    "/recommended",
  );

// Day 3
export const pushExplore = (): JourneyMessage =>
  push(
    JourneySlot.PUSH_EXPLORE,
    JourneyVariant.STANDARD,
    "New tracks worth a listen",
    "Browse the catalogue and download anything your credits cover.",
    "/recommended",
  );

// Day 4 — an unfinished Sound Tracking draft when there is one; otherwise the
// credits left, and nothing at all once they are 0.
export const pushResume = (
  ctx: TemplateContext,
  draft: { id: string; name: string } | null,
): JourneyMessage | null => {
  if (draft) {
    return push(
      JourneySlot.PUSH_RESUME,
      JourneyVariant.SOUND_TRACKING_RESUME,
      "Your project is still open",
      `"${draft.name}" is one step from a finished soundtrack.`,
      `/sound-tracking/editor?projectId=${encodeURIComponent(draft.id)}&source=resume`,
    );
  }
  if (ctx.creditsRemaining === 0) return null;
  return push(
    JourneySlot.PUSH_RESUME,
    JourneyVariant.CREDITS_REMAINING,
    "Pick up where you left off",
    `You have ${creditWord(ctx.creditsRemaining)} left, and your trial runs until ${formatDate(ctx.trialEnd)}.`,
    "/recommended",
  );
};

// Day 6 (the slot window is Day 6 only, so "tomorrow" holds)
export const pushContactSales = (): JourneyMessage =>
  push(
    JourneySlot.PUSH_CONTACT_SALES,
    JourneyVariant.STANDARD,
    "Your trial ends tomorrow",
    "Talk to us about keeping access to the catalogue.",
    "/contact-us?source=trial",
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
