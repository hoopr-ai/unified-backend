import bcrypt from "bcrypt";
import {
  type LoginUserRequestData,
  type LoginResponse,
  type ResetPasswordRequestData,
  AccessTokenExpiry,
  AccessTokenExpiryInSeconds,
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
  findUserRole,
  saveUser,
  saveUserRole,
  updateUserPassword,
  updateUserProfile,
  updateUserProfilePartial,
  findUserById,
  findUsersByBrandId,
  UserRoleDetails,
  type UserDetails,
  createSession,
  deactivateAllUserSessions,
  findActiveSessionByToken,
  updateSessionLastActivity,
  deactivateSessionByToken,
  deleteSessionByToken,
  isSessionExpiredByInactivity,
  type UserSessionDetails,
} from "../../persistence-service/exports";
import { AppError, createJWTToken, sendWelcomeEmail, sendInviteEmail } from "../../helper-service/modules.export";
import {
  ErrorMessages,
  Platform,
} from "../../dto-service/constants/modules.export";
import { logger } from "../../helper-service/logger";

interface LoginResponseWithSession extends LoginResponse {
  sessionId: number;
}

const buildLoginResponse = (
  user: UserDetails,
  role: string | null,
  isProfileComplete: boolean,
  token: string,
  sessionId: number
): LoginResponseWithSession => {
  return {
    id: user.id!,
    email: user.email,
    role,
    isProfileComplete,
    expiresIn: AccessTokenExpiryInSeconds,
    token,
    sessionId,
  };
};

const comparePasswordsEncrypted = async (
  password: string,
  encryptedPassword: string
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
    email,
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
  metadata?: SessionMetadata
): Promise<LoginResponseWithSession> => {
  const { email, password, platform } = data;
  const user = await findActiveUser(email, platform);
  await comparePasswordsEncrypted(password, user.password);
  const role = await findUserRole(user.id!);
  const token = createJWTToken(
    { userId: user.id, email: user.email, platform: user.platform, role },
    AccessTokenExpiry
  );

  // Create a new session for the user
  const sessionData: UserSessionDetails = {
    userId: user.id!,
    sessionToken: token,
    ipAddress: metadata?.ipAddress,
    userAgent: metadata?.userAgent,
    deviceType: metadata?.deviceType,
    browser: metadata?.browser,
    os: metadata?.os,
    status: SessionStatus.ACTIVE,
    lastActivityAt: new Date(),
    expiresAt: new Date(Date.now() + AccessTokenExpiryInSeconds * 1000),
    createdAt: new Date(),
  };

  const session = await createSession(sessionData);
  logger.info("User logged in", {
    userId: user.id,
    route: "/login"
  });
  return buildLoginResponse(user, role, user.isProfileComplete ?? false, token, session.id!);
};

export const validateAndRefreshSession = async (
  sessionToken: string
): Promise<{ isValid: boolean; session?: UserSessionDetails; needsNewSession: boolean }> => {
  const session = await findActiveSessionByToken(sessionToken);

  if (!session) {
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
  sessionToken: string
): Promise<void> => {
  await deactivateSessionByToken(sessionToken);
};

export const logoutAllSessionsService = async (
  userId: number
): Promise<void> => {
  await deactivateAllUserSessions(userId);
};

export const userResetPasswordService = async (
  data: ResetPasswordRequestData
): Promise<void> => {
  const { email, newPassword, platform, oldPassword } = data;
  const user = await findActiveUser(email, platform);
  await comparePasswordsEncrypted(oldPassword, user.password);
  if (oldPassword === newPassword) {
    throw new AppError(ErrorMessages.SamePassword, 400);
  }
  const hashedNewPassword = await bcrypt.hash(newPassword, 10);
  await updateUserPassword(email, platform, hashedNewPassword);
};

const createUserRoleDetails = (userId: number, role: UserRoles) => {
  const userRoleDetails: UserRoleDetails = {
    userId,
    role,
    status: UserStatus.ACTIVE,
    createdAt: new Date(),
  };
  return userRoleDetails;
}

export const createUserService = async (
  data: CreateAuthRequestData,
  createdBy?: number
): Promise<{}> => {
  const { email, password, platform, brandId } = data;
  const userDetails = await findActiveUserSilently(email, platform);
  if (userDetails) {
    throw new AppError(ErrorMessages.UserAlreadyExists, 400);
  }
  if(platform === Platform.ENTERPRISE && !brandId) {
    throw new AppError(ErrorMessages.UserNotAssociatedWithBrand, 400);
  }
  const hashedNewPassword = await bcrypt.hash(password, 10);
  const newUser = createUserDetails(email, platform, hashedNewPassword, brandId, createdBy);
  const savedUser = await saveUser(newUser);
  const userRoleDetails = createUserRoleDetails(savedUser.id!, UserRoles.ADMIN);
  await saveUserRole(userRoleDetails);

  // Send welcome email with credentials
  const loginUrl = `${process.env.FRONTEND_URL}/login`;
  await sendWelcomeEmail(email, password, loginUrl);

  return {};
};

export const inviteUserService = async (
  data: InviteUserAuthRequestData,
  createdBy?: number
): Promise<{}> => {
  const { email, password, platform } = data;
  const userDetails = await findActiveUserSilently(email, platform);
  if (userDetails) {
    throw new AppError(ErrorMessages.UserAlreadyExists, 400);
  }

  // Get the brandId from the inviting user
  let brandId: number | undefined;
  if (createdBy) {
    const invitingUser = await findUserById(createdBy);
    brandId = invitingUser?.brandId;
  }

  if (platform === Platform.ENTERPRISE && !brandId) {
    throw new AppError(ErrorMessages.UserNotAssociatedWithBrand, 400);
  }

  const hashedNewPassword = await bcrypt.hash(password, 10);
  const newUser = createUserDetails(email, platform, hashedNewPassword, brandId, createdBy);
  const savedUser = await saveUser(newUser);
  const userRoleDetails = createUserRoleDetails(savedUser.id!, UserRoles.USER);
  await saveUserRole(userRoleDetails);

  // Send invite email with credentials
  const loginUrl = `${process.env.FRONTEND_URL}/login`;
  await sendInviteEmail(email, password, loginUrl);

  return {};
};

export const completeProfileService = async (
  data: CompleteProfileRequestData,
  userId: number
): Promise<{}> => {
  const { firstName, lastName, mobile, profileRole } = data;

  const user = await findUserById(userId);
  if (!user) {
    throw new AppError(ErrorMessages.UserNotFound, 404);
  }

  if (user.isProfileComplete) {
    throw new AppError(ErrorMessages.ProfileAlreadyComplete, 400);
  }

  await updateUserProfile(userId, firstName, lastName, mobile, profileRole);

  return {};
};

export const getUserProfileService = async (
  userId: number
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
    mobile: user.mobile,
    profileRole: user.profileRole,
    isProfileComplete: user.isProfileComplete ?? false,
  };
};

export const updateUserProfileService = async (
  data: UpdateProfileRequestData,
  userId: number
): Promise<UserProfileResponse> => {
  const user = await findUserById(userId);
  if (!user) {
    throw new AppError(ErrorMessages.UserNotFound, 404);
  }

  await updateUserProfilePartial(userId, data);

  const updatedUser = await findUserById(userId);
  if (!updatedUser) {
    throw new AppError(ErrorMessages.UserNotFound, 404);
  }

  return {
    id: updatedUser.id!,
    email: updatedUser.email,
    firstName: updatedUser.firstName,
    lastName: updatedUser.lastName,
    mobile: updatedUser.mobile,
    profileRole: updatedUser.profileRole,
    isProfileComplete: updatedUser.isProfileComplete ?? false,
  };
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
  limit: number = 10
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

  const { rows, count } = await findUsersByBrandId(admin.brandId, validPage, validLimit);

  const users: UserProfileResponse[] = rows.map((user) => ({
    id: user.id!,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    mobile: user.mobile,
    profileRole: user.profileRole,
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