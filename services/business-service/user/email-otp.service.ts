import { AppError, redisClient, generateResetToken } from "../../helper-service/modules.export";
import { ErrorMessages } from "../../dto-service/constants/modules.export";
import { sendOtpEmail } from "../../helper-service/email.service";
import { logger } from "../../helper-service/logger";
import type { VerifyOtpResponse } from "../../dto-service/modules.export";

// OTP Configuration
const OTP_LENGTH = 6;
const OTP_TTL_SECONDS = 300; // 5 minutes
const MAX_RESEND_ATTEMPTS = 5;
const RESEND_WINDOW_SECONDS = 3600; // 1 hour
const MAX_VERIFY_ATTEMPTS = 5;
const BLOCK_DURATION_SECONDS = 1800; // 30 minutes

// Redis key prefixes
const KEY_OTP = (email: string) => `email_otp:${email.toLowerCase()}`;
const KEY_RESEND_ATTEMPTS = (email: string) =>
  `email_otp:resend_attempts:${email.toLowerCase()}`;
const KEY_VERIFY_ATTEMPTS = (email: string) =>
  `email_otp:verify_attempts:${email.toLowerCase()}`;
const KEY_BLOCK = (email: string) => `email_otp:block:${email.toLowerCase()}`;

const generateOtp = (): string => {
  return Math.floor(
    10 ** (OTP_LENGTH - 1) + Math.random() * 9 * 10 ** (OTP_LENGTH - 1),
  ).toString();
};

const validateEmail = (email: string): void => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    throw new AppError("Invalid email address", 400);
  }
};

export interface SendEmailOtpData {
  email: string;
  type?: "R"; // R for resend
}

export interface VerifyEmailOtpData {
  email: string;
  otp: string;
}

export const sendEmailOtpService = async (
  data: SendEmailOtpData,
): Promise<Record<string, never>> => {
  const { email } = data;
  const lowerEmail = email.toLowerCase().trim();

  validateEmail(lowerEmail);

  // Check resend rate limit
  const resendAttempts = parseInt(
    (await redisClient.get(KEY_RESEND_ATTEMPTS(lowerEmail))) || "0",
    10,
  );
  if (resendAttempts >= MAX_RESEND_ATTEMPTS) {
    throw new AppError(
      `You have exceeded the OTP resend limit. Please try again after ${RESEND_WINDOW_SECONDS / 60} minutes.`,
      429,
    );
  }

  // Invalidate existing OTP
  await redisClient.del(KEY_OTP(lowerEmail));

  // Generate and store new OTP
  const otp = generateOtp();
  await redisClient.set(KEY_OTP(lowerEmail), otp, "EX", OTP_TTL_SECONDS);

  // Increment resend counter
  await redisClient.set(
    KEY_RESEND_ATTEMPTS(lowerEmail),
    (resendAttempts + 1).toString(),
    "EX",
    RESEND_WINDOW_SECONDS,
  );

  // Send email
  try {
    await sendOtpEmail(lowerEmail, otp);
  } catch (err) {
    logger.error("Failed to send OTP email", {
      email: lowerEmail,
      error: (err as Error).message,
    });
    throw new AppError(
      ErrorMessages.OtpSendFailed || "Failed to send OTP email",
      500,
    );
  }

  logger.info("Email OTP sent", { email: lowerEmail });
  return {};
};

export const verifyEmailOtpService = async (
  data: VerifyEmailOtpData,
): Promise<VerifyOtpResponse> => {
  const { email, otp } = data;
  const lowerEmail = email.toLowerCase().trim();

  validateEmail(lowerEmail);

  // Check if email is blocked
  const isBlocked = await redisClient.get(KEY_BLOCK(lowerEmail));
  if (isBlocked) {
    throw new AppError(
      `Email temporarily locked. Try again in ${BLOCK_DURATION_SECONDS / 60} minutes.`,
      429,
    );
  }

  // Get stored OTP
  const storedOtp = await redisClient.get(KEY_OTP(lowerEmail));
  if (!storedOtp) {
    throw new AppError(
      ErrorMessages.OtpExpiredOrNotFound ||
        "OTP expired or not found. Please request a new OTP.",
      400,
    );
  }

  if (storedOtp === otp) {
    // OTP valid — clean up
    await redisClient.del(KEY_OTP(lowerEmail));
    await redisClient.del(KEY_VERIFY_ATTEMPTS(lowerEmail));
    await redisClient.del(KEY_RESEND_ATTEMPTS(lowerEmail));

    // Generate reset token for password reset
    const resetToken = generateResetToken(lowerEmail);

    logger.info("Email OTP verified, reset token generated", { email: lowerEmail });
    return { resetToken };
  }

  // Wrong OTP — increment attempts
  const attempts =
    parseInt(
      (await redisClient.get(KEY_VERIFY_ATTEMPTS(lowerEmail))) || "0",
      10,
    ) + 1;

  if (attempts >= MAX_VERIFY_ATTEMPTS) {
    // Block the email
    await redisClient.set(
      KEY_BLOCK(lowerEmail),
      "1",
      "EX",
      BLOCK_DURATION_SECONDS,
    );
    await redisClient.del(KEY_OTP(lowerEmail));
    await redisClient.del(KEY_VERIFY_ATTEMPTS(lowerEmail));

    throw new AppError(
      `Email temporarily locked. Try again in ${BLOCK_DURATION_SECONDS / 60} minutes.`,
      429,
    );
  }

  await redisClient.set(
    KEY_VERIFY_ATTEMPTS(lowerEmail),
    attempts.toString(),
    "EX",
    BLOCK_DURATION_SECONDS,
  );

  const remaining = MAX_VERIFY_ATTEMPTS - attempts;
  throw new AppError(
    `Invalid OTP. ${remaining} attempt${remaining === 1 ? "" : "s"} left.`,
    400,
  );
};
