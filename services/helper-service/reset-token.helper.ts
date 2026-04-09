import jwt from "jsonwebtoken";
import { v4 as uuidv4 } from "uuid";
import { redisClient } from "./redis.client";
import { AppError } from "./AppError";

// Reset token configuration
const RESET_TOKEN_EXPIRY = "10m"; // 10 minutes
const RESET_TOKEN_EXPIRY_SECONDS = 600;

// Redis key for tracking used tokens (single-use enforcement)
const KEY_USED_RESET_TOKEN = (tokenId: string) => `reset_token:used:${tokenId}`;

export interface ResetTokenPayload {
  email: string;
  tokenId: string; // Unique ID for single-use enforcement
  purpose: "password_reset";
}

/**
 * Generates a short-lived reset token after successful OTP verification.
 * The token contains the email and a unique ID for single-use enforcement.
 */
export const generateResetToken = (email: string): string => {
  const tokenId = uuidv4();
  const payload: ResetTokenPayload = {
    email: email.toLowerCase().trim(),
    tokenId,
    purpose: "password_reset",
  };

  const token = jwt.sign(payload, process.env.JWT_SECRET_KEY as string, {
    expiresIn: RESET_TOKEN_EXPIRY,
  });

  return token;
};

export interface VerifyResetTokenResult {
  email: string;
  tokenId: string;
}

/**
 * Verifies the reset token and ensures it hasn't been used before.
 * Returns the email and tokenId from the token payload.
 * Does NOT mark the token as used - call markResetTokenAsUsed after successful operation.
 */
export const verifyResetToken = async (token: string): Promise<VerifyResetTokenResult> => {
  let payload: ResetTokenPayload;

  try {
    payload = jwt.verify(
      token,
      process.env.JWT_SECRET_KEY as string
    ) as ResetTokenPayload;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new AppError("Reset token has expired. Please verify OTP again.", 401);
    }
    if (error instanceof jwt.JsonWebTokenError) {
      throw new AppError("Invalid reset token.", 401);
    }
    throw error;
  }

  // Validate token purpose
  if (payload.purpose !== "password_reset") {
    throw new AppError("Invalid token type.", 401);
  }

  // Check if token has already been used (single-use enforcement)
  const isUsed = await redisClient.get(KEY_USED_RESET_TOKEN(payload.tokenId));
  if (isUsed) {
    throw new AppError("Reset token has already been used.", 401);
  }

  return { email: payload.email, tokenId: payload.tokenId };
};

/**
 * Marks the reset token as used to prevent replay attacks.
 * Call this ONLY after the password reset operation succeeds.
 */
export const markResetTokenAsUsed = async (tokenId: string): Promise<void> => {
  await redisClient.set(
    KEY_USED_RESET_TOKEN(tokenId),
    "1",
    "EX",
    RESET_TOKEN_EXPIRY_SECONDS
  );
};
