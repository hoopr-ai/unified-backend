import bcrypt from "bcrypt";
import { v4 as uuidv4 } from "uuid";
import {
  AppError,
  redisClient,
  createJWTToken,
} from "../../helper-service/modules.export";
import { ErrorMessages } from "../../dto-service/constants/modules.export";
import { sendOtpEmail } from "../../helper-service/email.service";
import { logger } from "../../helper-service/logger";
import {
  AccessTokenExpiry,
  AccessTokenExpiryInSeconds,
  RefreshTokenExpiry,
  RefreshTokenExpiryInSeconds,
  SessionStatus,
  UserStatus,
  UserRoles,
  type LoginResponse,
  Platform,
} from "../../dto-service/modules.export";
import {
  findActiveUserSilently,
  findActiveUser,
  findUserRole,
  saveUser,
  saveUserRole,
  createSession,
  type UserSessionDetails,
  type UserDetails,
  type UserRoleDetails,
} from "../../persistence-service/exports";
import { findBrandById } from "../../persistence-service/brand/modules.export";

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

// Test account that always receives a fixed OTP (for QA / automated testing).
const TEST_EMAIL = "test@gsharp.media";
const TEST_OTP = "123456";

const generateOtp = (email: string): string => {
  if (email.toLowerCase().trim() === TEST_EMAIL) {
    return TEST_OTP;
  }
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
  platform: Platform;
}

export interface VerifyEmailOtpData {
  email: string;
  otp: string;
  platform: Platform;
}

interface LoginResponseWithSession extends LoginResponse {
  sessionId: number;
  isExistingUser: boolean;
}

const findOrCreateUser = async (
  email: string,
  platform: Platform,
): Promise<void> => {
  const existing = await findActiveUserSilently(email, platform);
  if (existing) return;

  // Auto-create the user with a placeholder password (OTP is the auth mechanism).
  // No brandId assigned at this point — admin can associate later.
  // isProfileComplete defaults to false so FE routes to complete-profile after first login.
  const placeholderPassword = await bcrypt.hash(uuidv4(), 10);
  const newUser: UserDetails = {
    email,
    platform,
    password: placeholderPassword,
    status: UserStatus.INVITED,
    createdAt: new Date(),
  };
  const savedUser = await saveUser(newUser);

  const roleDetails: UserRoleDetails = {
    userId: savedUser.id!,
    role: UserRoles.USER,
    status: UserStatus.ACTIVE,
    createdAt: new Date(),
  };
  await saveUserRole(roleDetails);

  logger.info("Auto-created user for email OTP login", { email, platform });
};

export const sendEmailOtpService = async (
  data: SendEmailOtpData,
): Promise<Record<string, never>> => {
  const { platform } = data;
  const lowerEmail = data.email.toLowerCase().trim();

  validateEmail(lowerEmail);

  // Create user if they don't exist yet
  await findOrCreateUser(lowerEmail, platform);

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
  const otp = generateOtp(lowerEmail);
  await redisClient.set(KEY_OTP(lowerEmail), otp, "EX", OTP_TTL_SECONDS);

  // Increment resend counter
  await redisClient.set(
    KEY_RESEND_ATTEMPTS(lowerEmail),
    (resendAttempts + 1).toString(),
    "EX",
    RESEND_WINDOW_SECONDS,
  );

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

  logger.info("Email OTP sent", { email: lowerEmail, platform });
  return {};
};

export const verifyEmailOtpService = async (
  data: VerifyEmailOtpData,
): Promise<LoginResponseWithSession> => {
  const { otp, platform } = data;
  const lowerEmail = data.email.toLowerCase().trim();

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

  if (storedOtp !== otp) {
    const attempts =
      parseInt(
        (await redisClient.get(KEY_VERIFY_ATTEMPTS(lowerEmail))) || "0",
        10,
      ) + 1;

    if (attempts >= MAX_VERIFY_ATTEMPTS) {
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
  }

  // OTP valid — clean up Redis keys
  await redisClient.del(KEY_OTP(lowerEmail));
  await redisClient.del(KEY_VERIFY_ATTEMPTS(lowerEmail));
  await redisClient.del(KEY_RESEND_ATTEMPTS(lowerEmail));

  // Fetch user and create session
  const user = await findActiveUser(lowerEmail, platform);
  const role = await findUserRole(user.id!);

  const token = createJWTToken(
    { userId: user.id, email: user.email, platform: user.platform, role },
    AccessTokenExpiry,
  );

  const refreshToken = createJWTToken(
    { userId: user.id },
    RefreshTokenExpiry,
  );

  const sessionData: UserSessionDetails = {
    userId: user.id!,
    sessionToken: token,
    refreshToken,
    status: SessionStatus.ACTIVE,
    lastActivityAt: new Date(),
    expiresAt: new Date(Date.now() + RefreshTokenExpiryInSeconds * 1000),
    createdAt: new Date(),
  };

  const session = await createSession(sessionData);

  const brand = user.brandId ? await findBrandById(user.brandId) : null;
  const brandName = (brand as any)?.name ?? undefined;

  logger.info("Email OTP verified, user logged in", {
    email: lowerEmail,
    platform,
    userId: user.id,
  });

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
    brandId: user.brandId,
    brandName,
    isExistingUser: !!user.createdBy,
  };
};
