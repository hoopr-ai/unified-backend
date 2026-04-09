import { type SendOtpRequestData, type VerifyOtpRequestData } from "../../dto-service/modules.export";
import { ErrorMessages } from "../../dto-service/constants/modules.export";
import { AppError, redisClient, sendOtpSms } from "../../helper-service/modules.export";
import { logger } from "../../helper-service/logger";

// OTP Configuration
const OTP_LENGTH = 6;
const OTP_TTL_SECONDS = 300; // 5 minutes
const MAX_RESEND_ATTEMPTS = 5;
const RESEND_WINDOW_SECONDS = 3600; // 1 hour
const MAX_VERIFY_ATTEMPTS = 5;
const BLOCK_DURATION_SECONDS = 1800; // 30 minutes

// Redis key prefixes
const KEY_OTP = (mobile: string, countryCode: string) => `otp:${countryCode}:${mobile}`;
const KEY_RESEND_ATTEMPTS = (mobile: string, countryCode: string) => `otp:resend_attempts:${countryCode}:${mobile}`;
const KEY_VERIFY_ATTEMPTS = (mobile: string, countryCode: string) => `otp:verify_attempts:${countryCode}:${mobile}`;
const KEY_BLOCK = (mobile: string, countryCode: string) => `otp:block:${countryCode}:${mobile}`;

const generateOtp = (): string => {
  return Math.floor(10 ** (OTP_LENGTH - 1) + Math.random() * 9 * 10 ** (OTP_LENGTH - 1)).toString();
};

const validateMobile = (mobile: string): void => {
  if (mobile.length < 8 || mobile.length > 15) {
    throw new AppError(ErrorMessages.InvalidMobileNumber, 400);
  }
};

export const sendOtpService = async (
  data: SendOtpRequestData,
): Promise<{ message: string }> => {
  const { mobile, countryCode } = data;

  validateMobile(mobile);

  // Check resend rate limit
  const resendAttempts = parseInt(await redisClient.get(KEY_RESEND_ATTEMPTS(mobile, countryCode)) || "0", 10);
  if (resendAttempts >= MAX_RESEND_ATTEMPTS) {
    throw new AppError(
      `${ErrorMessages.OtpResendLimitExceeded} Try again after ${RESEND_WINDOW_SECONDS / 60} minutes.`,
      429,
    );
  }

  // Invalidate existing OTP
  await redisClient.del(KEY_OTP(mobile, countryCode));

  // Generate and store new OTP
  const otp = generateOtp();
  await redisClient.set(KEY_OTP(mobile, countryCode), otp, "EX", OTP_TTL_SECONDS);

  // Increment resend counter
  await redisClient.set(
    KEY_RESEND_ATTEMPTS(mobile, countryCode),
    (resendAttempts + 1).toString(),
    "EX",
    RESEND_WINDOW_SECONDS,
  );

  // Send SMS
  try {
    await sendOtpSms(mobile, otp, countryCode);
  } catch (err) {
    logger.error("Failed to send OTP SMS", { mobile, countryCode, error: (err as Error).message });
    throw new AppError(ErrorMessages.OtpSendFailed, 500);
  }

  logger.info("OTP sent", { mobile, countryCode });
  return { message: "OTP sent successfully" };
};

/**
 * Verifies SMS OTP for mobile number verification.
 * Note: For password reset, use email OTP (verifyEmailOtpService) which returns a resetToken.
 * SMS OTP is primarily used for phone number verification during signup/profile completion.
 */
export const verifyOtpService = async (
  data: VerifyOtpRequestData,
): Promise<{ message: string; verified: boolean }> => {
  const { mobile, countryCode, otp } = data;

  // Check if number is blocked
  const isBlocked = await redisClient.get(KEY_BLOCK(mobile, countryCode));
  if (isBlocked) {
    throw new AppError(
      `${ErrorMessages.NumberTemporarilyLocked} Try again in ${BLOCK_DURATION_SECONDS / 60} minutes.`,
      429,
    );
  }

  // Get stored OTP
  const storedOtp = await redisClient.get(KEY_OTP(mobile, countryCode));
  if (!storedOtp) {
    throw new AppError(ErrorMessages.OtpExpiredOrNotFound, 400);
  }

  if (storedOtp === otp) {
    // OTP valid — clean up
    await redisClient.del(KEY_OTP(mobile, countryCode));
    await redisClient.del(KEY_VERIFY_ATTEMPTS(mobile, countryCode));
    await redisClient.del(KEY_RESEND_ATTEMPTS(mobile, countryCode));

    logger.info("OTP verified", { mobile, countryCode });
    return { message: "OTP verified successfully", verified: true };
  }

  // Wrong OTP — increment attempts
  const attempts = parseInt(await redisClient.get(KEY_VERIFY_ATTEMPTS(mobile, countryCode)) || "0", 10) + 1;

  if (attempts >= MAX_VERIFY_ATTEMPTS) {
    // Block the number
    await redisClient.set(KEY_BLOCK(mobile, countryCode), "1", "EX", BLOCK_DURATION_SECONDS);
    await redisClient.del(KEY_OTP(mobile, countryCode));
    await redisClient.del(KEY_VERIFY_ATTEMPTS(mobile, countryCode));

    throw new AppError(
      `${ErrorMessages.NumberTemporarilyLocked} Try again in ${BLOCK_DURATION_SECONDS / 60} minutes.`,
      429,
    );
  }

  await redisClient.set(
    KEY_VERIFY_ATTEMPTS(mobile, countryCode),
    attempts.toString(),
    "EX",
    BLOCK_DURATION_SECONDS,
  );

  const remaining = MAX_VERIFY_ATTEMPTS - attempts;
  throw new AppError(`Invalid OTP. ${remaining} attempt${remaining === 1 ? "" : "s"} left.`, 400);
};
