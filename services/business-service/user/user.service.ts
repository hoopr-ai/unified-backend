import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { UniqueConstraintError } from "sequelize";
import {
  type LoginUserRequestData,
  type LoginResponse,
  type ResetPasswordRequestData,
  AccessTokenExpiry,
  AccessTokenExpiryInSeconds,
  RefreshTokenExpiry,
  RefreshTokenExpiryInSeconds,
  CreateAuthRequestData,
  UserStatus,
  UserRoles,
  SessionStatus,
  type SessionMetadata,
  InviteUserAuthRequestData,
  CompleteProfileRequestData,
  UpdateProfileRequestData,
  UserProfileResponse,
} from "../../dto-service/modules.export";
import {
  findActiveUser,
  findActiveUserSilently,
  findUserByEmailAndPlatform,
  reactivateUser,
  findUserRole,
  saveUser,
  saveUserRole,
  updateUserPassword,
  updateUserProfile,
  updateUserProfilePartial,
  findUserById,
  findUsersByBrandId,
  findAllActiveUsersByBrandId,
  softDeleteUserById,
  UserRoleDetails,
  type UserDetails,
  createSession,
  deactivateAllUserSessions,
  findActiveSessionByToken,
  findActiveSessionByRefreshToken,
  updateSessionLastActivity,
  updateSessionToken,
  deactivateSessionByToken,
  deleteSessionByToken,
  isSessionExpiredByInactivity,
  type UserSessionDetails,
} from "../../persistence-service/exports";
import { findBrandById } from "../../persistence-service/brand/modules.export";
import {
  AppError,
  createJWTToken,
  sendAdminCredentialsEmail,
  sendTeamJoinNotificationEmail,
  sendInviteEmail,
  sendFirstLoginWelcomeEmail,
  verifyResetToken,
  markResetTokenAsUsed,
} from "../../helper-service/modules.export";
import {
  ErrorMessages,
  Platform,
} from "../../dto-service/constants/modules.export";
import { logger } from "../../helper-service/logger";
import { SessionPayload } from "../../../middlewares/authenticate";

interface LoginResponseWithSession extends LoginResponse {
  sessionId: number;
}

const buildLoginResponse = (
  user: UserDetails,
  role: string | null,
  isProfileComplete: boolean,
  token: string,
  refreshToken: string,
  sessionId: number,
  brandName?: string,
): LoginResponseWithSession => {
  return {
    id: user.id!,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    role,
    isProfileComplete,
    expiresIn: AccessTokenExpiryInSeconds,
    token,
    refreshToken,
    sessionId,
    brandId: user.brandId,
    brandName,
  };
};

const comparePasswordsEncrypted = async (
  password: string,
  encryptedPassword: string,
) => {
  const passwordMatch = await bcrypt.compare(password, encryptedPassword);
  if (!passwordMatch) {
    throw new AppError(ErrorMessages.IncorrectPassword, 401);
  }
};

const createUserDetails = (
  email: string,
  platform: string,
  password: string,
  brandId?: number,
  createdBy?: number,
): UserDetails => {
  const newUser: UserDetails = {
    email: email.toLowerCase().trim(),
    platform,
    password,
    status: UserStatus.ACTIVE,
    createdBy,
    createdAt: new Date(),
    brandId,
  };
  return newUser;
};

export const userLoginService = async (
  data: LoginUserRequestData,
  metadata?: SessionMetadata,
): Promise<LoginResponseWithSession> => {
  const { password, platform } = data;
  const email = data.email.toLowerCase().trim();
  const user = await findActiveUser(email, platform);
  await comparePasswordsEncrypted(password, user.password);
  const role = await findUserRole(user.id!);
  const token = createJWTToken(
    { userId: user.id, email: user.email, platform: user.platform, role },
    AccessTokenExpiry,
  );

  const refreshToken = createJWTToken(
    { userId: user.id },
    RefreshTokenExpiry,
  );

  // Create a new session for the user
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
  logger.info("User logged in", {
    userId: user.id,
    route: "/login",
  });

  // Send welcome email on first login (profile not yet completed)
  if (!user.isProfileComplete) {
    const firstName = user.firstName || "";
    sendFirstLoginWelcomeEmail(user.email, firstName).catch((err) => {
      logger.error("Failed to send first login welcome email", {
        userId: user.id,
        error: err.message,
      });
    });
  }

  const brand = user.brandId ? await findBrandById(user.brandId) : null;
  const brandName = (brand as any)?.name ?? undefined;

  return buildLoginResponse(
    user,
    role,
    user.isProfileComplete ?? false,
    token,
    refreshToken,
    session.id!,
    brandName,
  );
};

export const validateAndRefreshSession = async (
  sessionToken: string,
): Promise<{
  isValid: boolean;
  session?: UserSessionDetails;
  needsNewSession: boolean;
}> => {
  const session = await findActiveSessionByToken(sessionToken);

  if (!session) {
    return { isValid: false, needsNewSession: true };
  }

  // Check if the user is still active or invited (not deleted)
  const user = await findUserById(session.userId);
  if (
    !user ||
    (user.status !== UserStatus.ACTIVE && user.status !== UserStatus.INVITED)
  ) {
    // User is deleted or inactive - deactivate the session
    await deactivateSessionByToken(sessionToken);
    return { isValid: false, needsNewSession: true };
  }

  // Check if session has expired due to inactivity
  const isExpired = await isSessionExpiredByInactivity(session.id!);

  if (isExpired) {
    // Delete the expired session
    await deleteSessionByToken(sessionToken);
    return { isValid: false, needsNewSession: true };
  }

  // Update last activity time
  await updateSessionLastActivity(session.id!);

  return { isValid: true, session, needsNewSession: false };
};

export const logoutUserService = async (
  sessionToken: string,
): Promise<void> => {
  await deactivateSessionByToken(sessionToken);
};

export const logoutAllSessionsService = async (
  userId: number,
): Promise<void> => {
  await deactivateAllUserSessions(userId);
};

export const refreshTokenService = async (
  incomingRefreshToken: string,
): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> => {
  try {
    jwt.verify(incomingRefreshToken, process.env.JWT_SECRET_KEY as string);
  } catch {
    throw new AppError("Invalid or expired refresh token", 401);
  }

  const session = await findActiveSessionByRefreshToken(incomingRefreshToken);
  if (!session) {
    throw new AppError("Session not found or already logged out", 401);
  }

  const user = await findUserById(session.userId);
  if (
    !user ||
    (user.status !== UserStatus.ACTIVE && user.status !== UserStatus.INVITED)
  ) {
    await deactivateSessionByToken(session.sessionToken);
    throw new AppError("User account is inactive", 401);
  }

  const role = await findUserRole(session.userId);

  const newAccessToken = createJWTToken(
    { userId: user.id, email: user.email, platform: user.platform, role },
    AccessTokenExpiry,
  );

  const newRefreshToken = createJWTToken(
    { userId: user.id },
    RefreshTokenExpiry,
  );

  await updateSessionToken(session.id!, newAccessToken, newRefreshToken);

  return {
    accessToken: newAccessToken,
    refreshToken: newRefreshToken,
    expiresIn: AccessTokenExpiryInSeconds,
  };
};

export const userResetPasswordService = async (
  data: ResetPasswordRequestData,
): Promise<void> => {
  const { resetToken, newPassword, platform } = data;

  // Verify reset token and extract email (does NOT mark token as used yet)
  const { email, tokenId } = await verifyResetToken(resetToken);

  // Find user for the specific platform provided by FE
  const user = await findActiveUserSilently(email, platform);
  if (!user) {
    throw new AppError(ErrorMessages.UserNotFound, 404);
  }

  const isSameAsCurrentPassword = await bcrypt.compare(
    newPassword,
    user.password,
  );
  if (isSameAsCurrentPassword) {
    throw new AppError(ErrorMessages.SamePassword, 400);
  }

  const hashedNewPassword = await bcrypt.hash(newPassword, 10);
  await updateUserPassword(email, platform, hashedNewPassword);

  // Mark token as used only after password is successfully updated
  await markResetTokenAsUsed(tokenId);
};

const createUserRoleDetails = (userId: number, role: UserRoles) => {
  const userRoleDetails: UserRoleDetails = {
    userId,
    role,
    status: UserStatus.ACTIVE,
    createdAt: new Date(),
  };
  return userRoleDetails;
};

export const createUserService = async (
  data: CreateAuthRequestData,
  createdBy?: number,
): Promise<{}> => {
  const { email, password, platform, brandId } = data;
  const userDetails = await findActiveUserSilently(email, platform);
  if (userDetails) {
    throw new AppError(ErrorMessages.UserAlreadyExists, 400);
  }
  if (platform === Platform.ENTERPRISE && !brandId) {
    throw new AppError(ErrorMessages.UserNotAssociatedWithBrand, 400);
  }
  const hashedNewPassword = await bcrypt.hash(password, 10);
  const newUser = createUserDetails(
    email,
    platform,
    hashedNewPassword,
    brandId,
    createdBy,
  );
  const savedUser = await saveUser(newUser);
  const userRoleDetails = createUserRoleDetails(savedUser.id!, UserRoles.ADMIN);
  await saveUserRole(userRoleDetails);

  // Send admin credentials email
  const brand = brandId ? await findBrandById(brandId) : null;
  const brandName = (brand as any)?.name || "";
  // For enterprise users, send credentials email. For internal users, we can skip this as they are likely creating their own account.
  if (platform === Platform.ENTERPRISE) {
      await sendAdminCredentialsEmail(email, password, brandName);
  }
  return {};
};

const generateRandomPassword = (length: number = 12): string => {
  const uppercase = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const lowercase = "abcdefghijklmnopqrstuvwxyz";
  const numbers = "0123456789";
  const special = "!@#$%^&*";
  const allChars = uppercase + lowercase + numbers + special;

  // Ensure at least one of each type
  let password = "";
  password += uppercase[Math.floor(Math.random() * uppercase.length)];
  password += lowercase[Math.floor(Math.random() * lowercase.length)];
  password += numbers[Math.floor(Math.random() * numbers.length)];
  password += special[Math.floor(Math.random() * special.length)];

  // Fill the rest randomly
  for (let i = password.length; i < length; i++) {
    password += allChars[Math.floor(Math.random() * allChars.length)];
  }

  // Shuffle the password
  return password
    .split("")
    .sort(() => Math.random() - 0.5)
    .join("");
};

export const inviteUserService = async (
  data: InviteUserAuthRequestData,
  sessionData?: SessionPayload,
): Promise<{}> => {
  const email = data.email.trim().toLowerCase();
  const platform = sessionData?.platform!;
  const createdBy = sessionData?.userId;

  // Get the brandId from the inviting user
  let brandId: number | undefined;
  if (createdBy) {
    const invitingUser = await findUserById(createdBy);
    brandId = invitingUser?.brandId;
  }

  if (platform === Platform.ENTERPRISE && !brandId) {
    throw new AppError(ErrorMessages.UserNotAssociatedWithBrand, 400);
  }

  // Check if user already exists with any status
  const existingUser = await findUserByEmailAndPlatform(email, platform);

  if (existingUser) {
    // User exists and is active — cannot re-invite
    if (existingUser.status === UserStatus.ACTIVE) {
      throw new AppError(ErrorMessages.UserAlreadyInvited, 400);
    }

    // User is already invited (by same or another brand) — cannot re-invite
    if (existingUser.status === UserStatus.INVITED) {
      throw new AppError(ErrorMessages.UserAlreadyInvitedByAnotherBrand, 400);
    }

    // User was previously removed (DELETED) — reactivate with new password
    if (existingUser.status === UserStatus.DELETED) {
      const password = generateRandomPassword();
      const hashedNewPassword = await bcrypt.hash(password, 10);
      await reactivateUser(
        existingUser.id!,
        hashedNewPassword,
        brandId,
        createdBy,
      );

      const brand = brandId ? await findBrandById(brandId) : null;
      const brandName = (brand as any)?.name || "";
      const invitingUser = createdBy ? await findUserById(createdBy) : null;
      const inviterName = invitingUser
        ? [invitingUser.firstName, invitingUser.lastName]
            .filter(Boolean)
            .join(" ")
        : undefined;
      await sendInviteEmail(email, password, brandName, inviterName);
      return {};
    }
  }

  // Brand new user — create fresh
  const password = generateRandomPassword();
  const hashedNewPassword = await bcrypt.hash(password, 10);
  const newUser = {
    ...createUserDetails(
      email,
      platform,
      hashedNewPassword,
      brandId,
      createdBy,
    ),
    status: UserStatus.INVITED,
  };
  const savedUser = await saveUser(newUser);
  const userRoleDetails = createUserRoleDetails(savedUser.id!, UserRoles.USER);
  await saveUserRole(userRoleDetails);

  const brand = brandId ? await findBrandById(brandId) : null;
  const brandName = (brand as any)?.name || "";
  const invitingUser = createdBy ? await findUserById(createdBy) : null;
  const inviterName = invitingUser
    ? [invitingUser.firstName, invitingUser.lastName].filter(Boolean).join(" ")
    : undefined;
  await sendInviteEmail(email, password, brandName, inviterName);

  return {};
};

export const completeProfileService = async (
  data: CompleteProfileRequestData,
  userId: number,
): Promise<LoginResponseWithSession> => {
  const { firstName, lastName, mobile, countryCode, profileRole } = data;

  const user = await findUserById(userId);
  if (!user) {
    throw new AppError(ErrorMessages.UserNotFound, 404);
  }

  if (user.isProfileComplete) {
    throw new AppError(ErrorMessages.ProfileAlreadyComplete, 400);
  }

  try {
    await updateUserProfile(
      userId,
      firstName,
      lastName,
      mobile,
      countryCode,
      profileRole,
    );
  } catch (error) {
    if (error instanceof UniqueConstraintError) {
      const constraint = (error as any).parent?.constraint ?? "";
      if (
        constraint === "unique_mobile_platform" ||
        "mobile" in (error.fields ?? {})
      ) {
        throw new AppError(ErrorMessages.MobileAlreadyInUse, 409);
      }
      throw new AppError(
        "A conflicting value already exists. Please check your details.",
        409,
      );
    }
    throw error;
  }

  // Notify existing team members that someone has joined
  if (user.brandId) {
    const newMemberFirstName = firstName || "";
    const teamMembers = await findAllActiveUsersByBrandId(user.brandId, userId);
    await Promise.allSettled(
      teamMembers
        .filter((member) => !!member.email)
        .map((member) =>
          sendTeamJoinNotificationEmail(
            member.email,
            member.firstName || "",
            newMemberFirstName,
          ).catch((err) => {
            logger.error("Failed to send team join notification email", {
              recipientEmail: member.email,
              error: err.message,
            });
          }),
        ),
    );
  }

  // Fetch updated user, role, brand and return login-style response
  const updatedUser = await findUserById(userId);
  if (!updatedUser) throw new AppError(ErrorMessages.UserNotFound, 404);

  const role = await findUserRole(userId);
  const brand = updatedUser.brandId
    ? await findBrandById(updatedUser.brandId)
    : null;
  const brandName = (brand as any)?.name ?? undefined;

  const token = createJWTToken(
    { userId, email: updatedUser.email, platform: updatedUser.platform, role },
    AccessTokenExpiry,
  );

  const refreshToken = createJWTToken(
    { userId },
    RefreshTokenExpiry,
  );

  const sessionData: UserSessionDetails = {
    userId,
    sessionToken: token,
    refreshToken,
    status: SessionStatus.ACTIVE,
    lastActivityAt: new Date(),
    expiresAt: new Date(Date.now() + RefreshTokenExpiryInSeconds * 1000),
    createdAt: new Date(),
  };

  const session = await createSession(sessionData);

  return buildLoginResponse(
    updatedUser,
    role,
    true,
    token,
    refreshToken,
    session.id!,
    brandName,
  );
};

export const getUserProfileService = async (
  userId: number,
): Promise<UserProfileResponse> => {
  const user = await findUserById(userId);
  if (!user) {
    throw new AppError(ErrorMessages.UserNotFound, 404);
  }

  return {
    id: user.id!,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    status: user.status,
    mobile: user.mobile,
    countryCode: user.countryCode,
    profileRole: user.profileRole,
    isProfileComplete: user.isProfileComplete ?? false,
  };
};

export const updateUserProfileService = async (
  data: UpdateProfileRequestData,
  userId: number,
): Promise<UserProfileResponse> => {
  const user = await findUserById(userId);
  if (!user) {
    throw new AppError(ErrorMessages.UserNotFound, 404);
  }

  try {
    await updateUserProfilePartial(userId, data);
  } catch (error) {
    if (error instanceof UniqueConstraintError) {
      const constraint = (error as any).parent?.constraint ?? "";
      if (
        constraint === "unique_mobile_platform" ||
        "mobile" in (error.fields ?? {})
      ) {
        throw new AppError(ErrorMessages.MobileAlreadyInUse, 409);
      }
      throw new AppError(
        "A conflicting value already exists. Please check your details.",
        409,
      );
    }
    throw error;
  }

  const updatedUser = await findUserById(userId);
  if (!updatedUser) {
    throw new AppError(ErrorMessages.UserNotFound, 404);
  }

  return {
    id: updatedUser.id!,
    email: updatedUser.email,
    firstName: updatedUser.firstName,
    status: updatedUser.status,
    lastName: updatedUser.lastName,
    mobile: updatedUser.mobile,
    profileRole: updatedUser.profileRole,
    isProfileComplete: updatedUser.isProfileComplete ?? false,
  };
};

export const removeInvitedUserService = async (
  targetUserId: number,
  adminUserId: number,
): Promise<{}> => {
  if (targetUserId === adminUserId) {
    throw new AppError(ErrorMessages.CannotRemoveSelf, 400);
  }

  const admin = await findUserById(adminUserId);
  if (!admin) {
    throw new AppError(ErrorMessages.UserNotFound, 404);
  }

  if (!admin.brandId) {
    throw new AppError(ErrorMessages.UserNotAssociatedWithBrand, 400);
  }

  const targetUser = await findUserById(targetUserId);
  if (!targetUser) {
    throw new AppError(ErrorMessages.UserNotFound, 404);
  }

  if (targetUser.brandId !== admin.brandId) {
    throw new AppError(ErrorMessages.UserNotInBrand, 403);
  }

  const targetRole = await findUserRole(targetUserId);
  if (targetRole === UserRoles.ADMIN || targetRole === UserRoles.MASTER) {
    throw new AppError(ErrorMessages.CannotRemoveAdmin, 400);
  }

  // Deactivate all sessions of the target user to logout instantly
  await deactivateAllUserSessions(targetUserId);

  // Soft delete the user to remove access
  await softDeleteUserById(targetUserId);

  return {};
};

export interface PaginatedUsersResponse {
  users: UserProfileResponse[];
  pagination: {
    page: number;
    limit: number;
    totalItems: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
}

export const getUsersUnderAdminService = async (
  adminUserId: number,
  page: number = 1,
  limit: number = 10,
): Promise<PaginatedUsersResponse> => {
  const admin = await findUserById(adminUserId);
  if (!admin) {
    throw new AppError(ErrorMessages.UserNotFound, 404);
  }

  if (!admin.brandId) {
    throw new AppError(ErrorMessages.UserNotAssociatedWithBrand, 400);
  }

  const validPage = page > 0 ? page : 1;
  const validLimit = limit > 0 && limit <= 100 ? limit : 10;

  const { rows, count } = await findUsersByBrandId(
    admin.brandId,
    validPage,
    validLimit,
  );

  const users: UserProfileResponse[] = rows.map((user: any) => ({
    id: user.id!,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    mobile: user.mobile,
    status: user.status,
    profileRole: user.profileRole,
    role: user.userRoles?.[0]?.role,
    isProfileComplete: user.isProfileComplete ?? false,
  }));

  const totalPages = Math.ceil(count / validLimit);

  return {
    users,
    pagination: {
      page: validPage,
      limit: validLimit,
      totalItems: count,
      totalPages,
      hasNextPage: validPage < totalPages,
      hasPrevPage: validPage > 1,
    },
  };
};
