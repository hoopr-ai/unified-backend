import bcrypt from "bcrypt";
import {
  type LoginUserRequestData,
  type LoginResponse,
  type UserRow,
  type ResetPasswordRequestData,
  AccessTokenExpiry,
} from "../../dto-service/modules.export";
import { formatDate } from "../../helper-service/date-formatting.service";
import {
  findActiveUser,
  updateUserPassword,
  type UserDetails,
} from "../../persistence-service/exports";
import { AppError, createJWTToken } from "../../helper-service/modules.export";
import {
  ErrorMessages,
  ResponseMessages,
} from "../../dto-service/constants/modules.export";

const buildLoginResponse = (
  user: UserDetails,
  formattedCreatedAt: string,
  token: string
): LoginResponse => {
  return {
    token,
    userData: {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      createdAt: formattedCreatedAt,
      updatedAt: formattedCreatedAt,
      expiresIn: 3 * 60 * 60,
    },
  };
};

const comparePasswords = async (
  password: string,
  encryptedPassword: string
) => {
  const passwordMatch = await bcrypt.compare(password, encryptedPassword);
  if (!passwordMatch) {
    throw new AppError(ErrorMessages.IncorrectPassword, 401);
  }
};

export const userLoginService = async (
  data: LoginUserRequestData
): Promise<LoginResponse> => {
  const { email, password, platform } = data;
  const user = await findActiveUser(email, platform);
  await comparePasswords(password, user.password);
  const token = createJWTToken(
    { userId: user.id, email: user.email, platform: user.platform },
    AccessTokenExpiry
  );
  const formattedCreatedAt = formatDate(user.createdAt);
  return buildLoginResponse(user, formattedCreatedAt, token);
};

export const userResetPasswordService = async (
  data: ResetPasswordRequestData
): Promise<void> => {
  const { email, newPassword, platform, oldPassword } = data;
  const user = await findActiveUser(email, platform);
  await comparePasswords(oldPassword, user.password);
  if (oldPassword === newPassword) {
    throw new AppError(ErrorMessages.SamePassword, 400);
  }
  const hashedNewPassword = await bcrypt.hash(newPassword, 10);
  await updateUserPassword(email, platform, hashedNewPassword);
};
