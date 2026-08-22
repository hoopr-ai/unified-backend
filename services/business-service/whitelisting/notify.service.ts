// ─── Creator notifications for whitelisting outcomes ─────────────────────────
//
// The complaint behind this dashboard is not only that clearance was slow. It
// is that a creator submits a channel, sees 'sent', and then hears nothing —
// forever — while their videos keep getting claimed. Deciding an outcome
// without telling them fixes our queue and none of their experience.
//
// So a terminal transition sends mail, exactly once per outcome. De-dup is a
// (notifiedStatus, notifiedAt) pair on the ops row rather than a "sent" boolean:
// a channel that goes whitelisted → rejected → whitelisted must notify on each
// real change, but re-saving the same status must not.
//
// Email only, deliberately. unified-backend owns SMTP; push to creators lives in
// content-recommendation behind its own service. `pushHook` below is where that
// call goes when it is wired — the transition path already treats notification
// as best-effort, so adding it changes nothing else.

import { sendEmail } from "../../helper-service/email.service";
import { logger } from "../../helper-service/logger";
import type { ChannelSource, ClaimStatus, WhitelistStatus } from "./whitelisting-shared";

const SUPPORT_EMAIL = process.env.CREATOR_SUPPORT_EMAIL || "support@hoopr.ai";

const SOURCE_LABELS: Record<ChannelSource, string> = {
  youtube: "YouTube",
  instagram: "Instagram",
  facebook: "Facebook",
};

const shell = (title: string, body: string): string => `
<!DOCTYPE html>
<html>
  <head><meta charset="UTF-8" /><title>${title}</title></head>
  <body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 0;">
      <tr><td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:10px;overflow:hidden;">
          <tr><td style="padding:28px 32px 8px;">
            <div style="font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#71717a;">Hoopr</div>
            <h1 style="margin:10px 0 0;font-size:21px;line-height:1.3;color:#18181b;">${title}</h1>
          </td></tr>
          <tr><td style="padding:12px 32px 28px;font-size:15px;line-height:1.6;color:#3f3f46;">
            ${body}
            <p style="margin:26px 0 0;font-size:13px;color:#71717a;">
              Questions? Just reply to this mail, or write to
              <a href="mailto:${SUPPORT_EMAIL}" style="color:#2563eb;">${SUPPORT_EMAIL}</a>.
            </p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;

const greet = (name?: string | null): string =>
  `<p style="margin:0 0 14px;">Hi ${name?.trim() ? name.trim().split(" ")[0] : "there"},</p>`;

export interface ChannelNotice {
  email: string | null;
  firstName?: string | null;
  source: ChannelSource;
  handle: string | null;
  status: WhitelistStatus;
  /** Operator's note. Surfaced verbatim on a rejection — the creator is owed the reason. */
  note?: string | null;
}

export interface ClaimNotice {
  email: string | null;
  firstName?: string | null;
  videoUrl: string;
  status: ClaimStatus;
  note?: string | null;
}

/** HTML-escape anything operator- or creator-supplied before it enters a template. */
const esc = (v: string | null | undefined): string =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

// Only terminal outcomes are worth an email. 'sent' is the creator's own action
// (they already know) and 'not_sent' is an operator reset, which is internal.
const CHANNEL_NOTIFIABLE: WhitelistStatus[] = ["whitelisted", "rejected"];
const CLAIM_NOTIFIABLE: ClaimStatus[] = ["RESOLVED", "REJECTED"];

export const channelNotifiable = (s: WhitelistStatus): boolean =>
  CHANNEL_NOTIFIABLE.includes(s);

export const claimNotifiable = (s: ClaimStatus): boolean =>
  CLAIM_NOTIFIABLE.includes(s);

/**
 * Mail a channel outcome. Resolves false when there was nothing to send or the
 * send failed — the caller records that, and never fails the status change over
 * it. An operator's decision must not be lost because SMTP was down.
 */
export const notifyChannel = async (n: ChannelNotice): Promise<boolean> => {
  if (!n.email || !channelNotifiable(n.status)) return false;

  const platform = SOURCE_LABELS[n.source] ?? n.source;
  const channel = n.handle ? `<strong>${esc(n.handle)}</strong>` : `your ${platform} channel`;

  const { subject, body } =
    n.status === "whitelisted"
      ? {
          subject: `Your ${platform} channel is whitelisted`,
          body:
            greet(n.firstName) +
            `<p style="margin:0 0 14px;">Good news — ${channel} has been whitelisted for Hoopr music. ` +
            `Copyright claims from our catalogue should no longer appear on your uploads from this channel.</p>` +
            `<p style="margin:0 0 14px;">If a claim was already on a video before this, it will not clear itself — ` +
            `send us the video link through Claim Clearance in the app and we will release it.</p>`,
        }
      : {
          subject: `About your ${platform} channel whitelisting request`,
          body:
            greet(n.firstName) +
            `<p style="margin:0 0 14px;">We reviewed ${channel} for whitelisting and could not clear it.</p>` +
            (n.note
              ? `<p style="margin:0 0 14px;padding:12px 14px;background:#fafafa;border-left:3px solid #e4e4e7;color:#3f3f46;">${esc(n.note)}</p>`
              : "") +
            `<p style="margin:0 0 14px;">If you think this is a mistake, or the channel details have changed, ` +
            `reply to this mail and we will take another look.</p>`,
        };

  return send(n.email, subject, body);
};

/** Mail a claim outcome. Same best-effort contract as notifyChannel. */
export const notifyClaim = async (n: ClaimNotice): Promise<boolean> => {
  if (!n.email || !claimNotifiable(n.status)) return false;

  const video = `<a href="${esc(n.videoUrl)}" style="color:#2563eb;word-break:break-all;">${esc(n.videoUrl)}</a>`;

  const { subject, body } =
    n.status === "RESOLVED"
      ? {
          subject: "Your copyright claim has been released",
          body:
            greet(n.firstName) +
            `<p style="margin:0 0 14px;">The claim on ${video} has been released.</p>` +
            `<p style="margin:0 0 14px;">It can take a few hours for the platform to reflect this on your video.</p>`,
        }
      : {
          subject: "About your copyright claim request",
          body:
            greet(n.firstName) +
            `<p style="margin:0 0 14px;">We looked into the claim on ${video} and were not able to release it.</p>` +
            (n.note
              ? `<p style="margin:0 0 14px;padding:12px 14px;background:#fafafa;border-left:3px solid #e4e4e7;color:#3f3f46;">${esc(n.note)}</p>`
              : "") +
            `<p style="margin:0 0 14px;">If you have more details — a different video, or proof of licence — ` +
            `reply to this mail and we will re-open it.</p>`,
        };

  return send(n.email, subject, body);
};

const send = async (to: string, subject: string, body: string): Promise<boolean> => {
  try {
    await sendEmail({ to, subject, html: shell(subject, body) });
    return true;
  } catch (error) {
    // Best-effort by design: see the note on notifyChannel.
    logger.error("whitelisting: notification failed", {
      to,
      subject,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
};
