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
} from "../../dto-service/modules.export";
import {
  findActiveUser,
  findUserRole,
  saveUser,
  saveUserRole,
  updateUserPassword,
  type UserDetails,
} from "../../persistence-service/exports";
import { AppError, createJWTToken } from "../../helper-service/modules.export";
import {
  ErrorMessages,
} from "../../dto-service/constants/modules.export";

const buildLoginResponse = (
  user: UserDetails,
  role: string | null,
  updatedAt: Date | undefined,
  token: string
): LoginResponse => {
  return {
    id: user.id!,
    email: user.email,
    role,
    updatedAt: updatedAt ? Number(updatedAt) : undefined,
    expiresIn: AccessTokenExpiryInSeconds,
    token,
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
  firstName: string,
  lastName: string,
  platform: string,
  password: string
): UserDetails => {
  const newUser: UserDetails = {
    email,
    firstName,
    lastName,
    platform,
    password,
    status: UserStatus.ACTIVE,
    createdAt: new Date(),
  };
  return newUser;
};

export const userLoginService = async (
  data: LoginUserRequestData
): Promise<LoginResponse> => {
  const { email, password, platform } = data;
  const user = await findActiveUser(email, platform);
  await comparePasswordsEncrypted(password, user.password);
  const role = await findUserRole(user.id!);
  const token = createJWTToken(
    { userId: user.id, email: user.email, platform: user.platform, role },
    AccessTokenExpiry
  );
  return buildLoginResponse(user, role, user.updatedAt, token);
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

export const createUserService = async (
  data: CreateAuthRequestData
): Promise<{}> => {
  const { email, password, platform, firstName, lastName } = data;
  const user = await findActiveUser(email, platform);
  if (user) {
    throw new AppError(ErrorMessages.UserAlreadyExists, 400);
  }
  const hashedNewPassword = await bcrypt.hash(password, 10);
  const newUser = createUserDetails(email, firstName, lastName, platform, hashedNewPassword);
  const savedUser = await saveUser(newUser);
  await saveUserRole(savedUser.id!, UserRoles.ADMIN);
  return {};
};