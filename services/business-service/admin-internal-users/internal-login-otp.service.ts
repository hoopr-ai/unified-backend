import {
  AppError,
  redisClient,
  createJWTToken,
} from "../../helper-service/modules.export";
import { sendInternalLoginOtpEmail } from "./email.helper";
import { logger } from "../../helper-service/logger";
import {
  Platform,
  UserStatus,
  AccessTokenExpiry,
  AccessTokenExpiryInSeconds,
  RefreshTokenExpiry,
  RefreshTokenExpiryInSeconds,
  SessionStatus,
  type LoginResponse,
  type SessionMetadata,
} from "../../dto-service/modules.export";
import {
  findUserByEmailAndPlatform,
  findUserRole,
  createSession,
  touchUserLastLogin,
  type UserSessionDetails,
} from "../../persistence-service/user/modules.export";

// OTP-based login for the INTERNAL admin CMS. Distinct Redis namespace from the existing
// password-reset OTP flow (services/business-service/user/email-otp.service.ts uses
// "email_otp:*" keys; we use "internal_login_otp:*") so a reset-flow OTP can never be
// replayed as a login OTP, and vice versa.
//
// Threat model: this is for Hoopr employees. Email-enumeration risk is low so we return
// explicit 404 / 403 errors rather than always-200 responses — admin UX matters more.

const OTP_LENGTH = 6;
const OTP_TTL_SECONDS = 300; // 5 minutes
const MAX_RESEND_ATTEMPTS = 5;
const RESEND_WINDOW_SECONDS = 3600; // 1 hour
const MAX_VERIFY_ATTEMPTS = 5;
const BLOCK_DURATION_SECONDS = 1800; // 30 minutes

const KEY_OTP = (email: string) => `internal_login_otp:${email.toLowerCase()}`;
const KEY_RESEND = (email: string) =>
  `internal_login_otp:resend:${email.toLowerCase()}`;
const KEY_VERIFY_ATTEMPTS = (email: string) =>
  `internal_login_otp:verify:${email.toLowerCase()}`;
const KEY_BLOCK = (email: string) =>
  `internal_login_otp:block:${email.toLowerCase()}`;

const generateOtp = (): string => {
  const min = 10 ** (OTP_LENGTH - 1);
  return Math.floor(min + Math.random() * 9 * min).toString();
};

interface SendInternalLoginOtpInput {
  email: string;
}

export const sendInternalLoginOtpService = async (
  input: SendInternalLoginOtpInput
): Promise<{ sent: true }> => {
  const email = input.email.trim().toLowerCase();

  // Must be an existing INTERNAL user. We DO NOT silently 200 for unknown emails — admins
  // typing their own email expect a clear error if they typo the domain.
  const user = await findUserByEmailAndPlatform(email, Platform.INTERNAL);
  if (!user) {
    throw new AppError("No internal user with that email.", 404);
  }
  if (user.status === UserStatus.DELETED) {
    throw new AppError(
      "This account has been deactivated. Contact an admin.",
      403
    );
  }

  // Resend rate limit. After MAX_RESEND_ATTEMPTS in RESEND_WINDOW_SECONDS, we 429 the email.
  const resends = parseInt(
    (await redisClient.get(KEY_RESEND(email))) || "0",
    10
  );
  if (resends >= MAX_RESEND_ATTEMPTS) {
    throw new AppError(
      `OTP resend limit hit. Try again after ${RESEND_WINDOW_SECONDS / 60} minutes.`,
      429
    );
  }

  // Generate, store, send. Existing OTP for this email is invalidated so verify-attempt
  // counters from a prior session don't leak.
  await redisClient.del(KEY_OTP(email));
  const otp = generateOtp();
  await redisClient.set(KEY_OTP(email), otp, "EX", OTP_TTL_SECONDS);
  await redisClient.set(
    KEY_RESEND(email),
    String(resends + 1),
    "EX",
    RESEND_WINDOW_SECONDS
  );

  try {
    await sendInternalLoginOtpEmail(email, otp);
  } catch (err) {
    logger.error("Failed to send INTERNAL login OTP", {
      email,
      error: (err as Error).message,
    });
    throw new AppError("Failed to send OTP email. Please retry.", 502);
  }

  logger.info("Internal login OTP sent", { userId: user.id });
  return { sent: true };
};

interface VerifyInternalLoginOtpInput {
  email: string;
  otp: string;
}

interface InternalLoginResult extends LoginResponse {
  sessionId: number;
}

export const verifyInternalLoginOtpService = async (
  input: VerifyInternalLoginOtpInput,
  metadata?: SessionMetadata
): Promise<InternalLoginResult> => {
  const email = input.email.trim().toLowerCase();
  const otp = input.otp.trim();

  // Block check first — short-circuit before doing any DB or Redis work for blocked emails.
  if (await redisClient.get(KEY_BLOCK(email))) {
    throw new AppError(
      `Too many failed attempts. Try again in ${BLOCK_DURATION_SECONDS / 60} minutes.`,
      429
    );
  }

  const stored = await redisClient.get(KEY_OTP(email));
  if (!stored) {
    throw new AppError("OTP expired or not requested. Please request a new one.", 400);
  }

  if (stored !== otp) {
    // Wrong OTP — increment counter, block at MAX_VERIFY_ATTEMPTS.
    const attempts =
      parseInt((await redisClient.get(KEY_VERIFY_ATTEMPTS(email))) || "0", 10) + 1;

    if (attempts >= MAX_VERIFY_ATTEMPTS) {
      await redisClient.set(KEY_BLOCK(email), "1", "EX", BLOCK_DURATION_SECONDS);
      await redisClient.del(KEY_OTP(email));
      await redisClient.del(KEY_VERIFY_ATTEMPTS(email));
      throw new AppError(
        `Too many failed attempts. Try again in ${BLOCK_DURATION_SECONDS / 60} minutes.`,
        429
      );
    }

    await redisClient.set(
      KEY_VERIFY_ATTEMPTS(email),
      String(attempts),
      "EX",
      BLOCK_DURATION_SECONDS
    );
    const remaining = MAX_VERIFY_ATTEMPTS - attempts;
    throw new AppError(
      `Invalid OTP. ${remaining} attempt${remaining === 1 ? "" : "s"} left.`,
      400
    );
  }

  // OTP correct. Re-fetch user (status may have changed during the OTP window).
  const user = await findUserByEmailAndPlatform(email, Platform.INTERNAL);
  if (!user) {
    // Shouldn't happen if send-otp succeeded, but defensive.
    throw new AppError("No internal user with that email.", 404);
  }
  if (user.status === UserStatus.DELETED) {
    throw new AppError(
      "This account has been deactivated. Contact an admin.",
      403
    );
  }

  // Burn the OTP and clean up counters. One OTP, one login.
  await redisClient.del(KEY_OTP(email));
  await redisClient.del(KEY_VERIFY_ATTEMPTS(email));
  await redisClient.del(KEY_RESEND(email));

  const role = await findUserRole(user.id!);
  const token = createJWTToken(
    {
      userId: user.id,
      email: user.email,
      platform: user.platform,
      role,
    },
    AccessTokenExpiry
  );
  const refreshToken = createJWTToken(
    { userId: user.id },
    RefreshTokenExpiry
  );

  const sessionData: UserSessionDetails = {
    userId: user.id!,
    sessionToken: token,
    refreshToken,
    ipAddress: metadata?.ipAddress,
    userAgent: metadata?.userAgent,
    deviceType: metadata?.deviceType,
    browser: metadata?.browser,
    os: metadata?.os,
    status: SessionStatus.ACTIVE,
    lastActivityAt: new Date(),
    expiresAt: new Date(Date.now() + RefreshTokenExpiryInSeconds * 1000),
    createdAt: new Date(),
  };
  const session = await createSession(sessionData);

  // Same lastLoginAt pattern as /user/login when platform === INTERNAL.
  touchUserLastLogin(user.id!).catch((err) => {
    logger.error("Failed to update lastLoginAt for INTERNAL OTP login", {
      userId: user.id,
      error: err.message,
    });
  });

  logger.info("INTERNAL OTP login successful", { userId: user.id });

  return {
    id: user.id!,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    mobile: user.mobile ?? null,
    countryCode: user.countryCode ?? null,
    role,
    isProfileComplete: user.isProfileComplete ?? false,
    expiresIn: AccessTokenExpiryInSeconds,
    token,
    refreshToken,
    sessionId: session.id!,
  };
};
