import { ErrorMessages, type Platform } from "../../dto-service/constants/modules.export";
import { UserStatus, type UserRoles } from "../../dto-service/modules.export";
import { AppError } from "../../helper-service/AppError";
import { UserModel, UserRoleModel, type UserDetails } from "./schemas/modules.export";

export const findActiveUser = async (email: string, platform: Platform): Promise<UserDetails> => {
    const userDetails =  await UserModel.findOne({
      where: { email, platform, status: UserStatus.ACTIVE },
    });
    if (!userDetails) {
      throw new AppError(ErrorMessages.UserNotFound, 404);
    }
    return userDetails;
  }

export const updateUserPassword = async (
  email: string,
  platform: Platform,
  hashedPassword: string
): Promise<void> => {
  await UserModel.update(
    { password: hashedPassword },
    { where: { email, platform, status: UserStatus.ACTIVE } }
  );
}

export const saveUser = async (
  userDetails: UserDetails
): Promise<UserDetails> => {
  const user = await UserModel.create(userDetails);
  return user;
}

export const saveUserRole = async (
  userId: number,
  role: UserRoles
): Promise<void> => {
  await UserRoleModel.create({
    userId,
    role,
    status: UserStatus.ACTIVE,
  } as any);
}

export const findUserRole = async (
  userId: number
): Promise<UserRoles | null> => {
  const userRole = await UserRoleModel.findOne({
    where: { userId, status: UserStatus.ACTIVE },
  });
  return userRole?.role ?? null;
}