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
} from "../../dto-service/modules.export";
import {
  findActiveUser,
  findActiveUserSilently,
  findUserRole,
  saveUser,
  saveUserRole,
  updateUserPassword,
  updateUserProfile,
  findUserById,
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
    isProfileComplete: false,
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

  return buildLoginResponse(user, role, user.isProfileComplete, token, session.id!);
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
  const { firstName, lastName, mobile } = data;

  const user = await findUserById(userId);
  if (!user) {
    throw new AppError(ErrorMessages.UserNotFound, 404);
  }

  await updateUserProfile(userId, firstName, lastName, mobile);

  return {};
};