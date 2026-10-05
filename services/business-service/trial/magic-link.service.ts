import crypto from "crypto";
import { AppError, redisClient } from "../../helper-service/modules.export";
import { logger } from "../../helper-service/logger";
import { Platform } from "../../dto-service/modules.export";
import { findActiveUserSilently, findUserById } from "../../persistence-service/exports";
import { issueLoginForUser, type LoginResponseWithSession } from "../user/email-otp.service";
import { markSendEngagedById } from "../../persistence-service/trial/modules.export";

// One-click login for the trial journey's "not logged in" lane (Email 1,
// Email 3, onboarding re-triggers). The link is a bearer credential for one
// mailbox, exactly like the OTP it stands in for, so:
//   - 32 random bytes; only the sha256 is stored, so a Redis dump leaks nothing
//   - single use (GETDEL), 72h TTL — long enough to outlive the email's day
//   - ENTERPRISE only; the user is re-read at redeem time, so a deleted or
//     moved account cannot be logged into with an old link
const TTL_SECONDS = 72 * 60 * 60;
const KEY = (hash: string) => `trial_magic_link:${hash}`;
const sha256 = (v: string) => crypto.createHash("sha256").update(v).digest("hex");

interface MagicLinkPayload {
  userId: number;
  email: string;
  // The journey send that carried the link — redeeming it counts as a click.
  sendId: number | null;
}

export const frontendUrl = (): string =>
  (process.env.FRONTEND_URL || "https://smash.hoopr.ai").replace(/\/+$/, "");

// Returns the full URL to put in the email. The FE page at /magic-login posts
// the token to POST /user/magic-link/verify and stores the session like OTP.
export const createMagicLoginUrl = async (
  userId: number,
  email: string,
  sendId: number | null,
  redirect = "/home",
): Promise<string> => {
  const token = crypto.randomBytes(32).toString("base64url");
  const payload: MagicLinkPayload = { userId, email: email.toLowerCase(), sendId };
  await redisClient.set(KEY(sha256(token)), JSON.stringify(payload), "EX", TTL_SECONDS);
  const params = new URLSearchParams({ token, redirect });
  return `${frontendUrl()}/magic-login?${params.toString()}`;
};

export const redeemMagicLinkService = async (
  token: string,
): Promise<LoginResponseWithSession> => {
  const raw = await redisClient.getdel(KEY(sha256(token)));
  if (!raw) {
    throw new AppError("This login link has expired or was already used. Please log in with your email.", 401);
  }
  const payload = JSON.parse(raw) as MagicLinkPayload;

  // Re-read by email + platform, the same lookup OTP verify uses, and make
  // sure it is still the same user the link was minted for.
  const user = await findActiveUserSilently(payload.email, Platform.ENTERPRISE);
  if (!user || Number(user.id) !== Number(payload.userId)) {
    const stillThere = await findUserById(payload.userId);
    logger.warn("Magic link redeemed for a user that no longer matches", {
      userId: payload.userId,
      found: Boolean(stillThere),
    });
    throw new AppError("This login link is no longer valid. Please log in with your email.", 401);
  }

  const response = await issueLoginForUser(user);
  if (payload.sendId) {
    markSendEngagedById(payload.sendId, payload.userId, "click").catch(() => undefined);
  }
  logger.info("Trial magic link redeemed", { userId: payload.userId, sendId: payload.sendId });
  return response;
};
