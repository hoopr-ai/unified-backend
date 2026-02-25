import { ErrorMessages, type Platform } from "../../dto-service/constants/modules.export";
import { UserStatus, type UserRoles, type ProfileRole } from "../../dto-service/modules.export";
import { AppError } from "../../helper-service/AppError";
import { UserModel, UserRoleDetails, UserRoleModel, type UserDetails } from "./schemas/modules.export";
import { Op } from "sequelize";

const ACTIVE_OR_INVITED = { [Op.in]: [UserStatus.ACTIVE, UserStatus.INVITED] };

export const findActiveUser = async (email: string, platform: Platform): Promise<UserDetails> => {
    const userDetails =  await UserModel.findOne({
      where: { email, platform, status: ACTIVE_OR_INVITED },
    });
    if (!userDetails) {
      throw new AppError(ErrorMessages.UserNotFound, 404);
    }
    return userDetails;
  }

export const findActiveUserSilently = async (email: string, platform: Platform): Promise<UserDetails | null> => {
  const userDetails =  await UserModel.findOne({
    where: { email, platform, status: ACTIVE_OR_INVITED },
  });
  return userDetails;
}

export const findUserByEmailAndPlatform = async (email: string, platform: Platform): Promise<UserDetails | null> => {
  const userDetails = await UserModel.findOne({
    where: { email, platform },
  });
  return userDetails;
}

export const reactivateUser = async (
  userId: number,
  hashedPassword: string,
  brandId?: number,
  createdBy?: number,
): Promise<void> => {
  await UserModel.update(
    {
      status: UserStatus.INVITED,
      password: hashedPassword,
      brandId,
      createdBy,
      firstName: null,
      lastName: null,
      mobile: null,
      profileRole: null,
    } as any,
    { where: { id: userId } },
  );
  // Reactivate existing role or create new one
  const existingRole = await UserRoleModel.findOne({ where: { userId } });
  if (existingRole) {
    await UserRoleModel.update(
      { status: UserStatus.ACTIVE },
      { where: { userId } },
    );
  }
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
  userRoleDetails: UserRoleDetails
): Promise<UserRoleDetails> => {
  return await UserRoleModel.create(userRoleDetails);
}

export const findUserRole = async (
  userId: number
): Promise<UserRoles | null> => {
  const userRole = await UserRoleModel.findOne({
    where: { userId, status: UserStatus.ACTIVE },
  });
  return userRole?.role ?? null;
}

export const findUserById = async (
  userId: number
): Promise<UserDetails | null> => {
  const userDetails = await UserModel.findOne({
    where: { id: userId, status: ACTIVE_OR_INVITED },
  });
  return userDetails;
}

export const updateUserProfile = async (
  userId: number,
  firstName: string,
  lastName: string,
  mobile: string,
  profileRole: ProfileRole
): Promise<void> => {
  await UserModel.update(
    { firstName, lastName, mobile, profileRole, status: UserStatus.ACTIVE, isProfileComplete: true },
    { where: { id: userId, status: ACTIVE_OR_INVITED } }
  );
}

export const updateUserProfilePartial = async (
  userId: number,
  updates: {
    firstName?: string;
    lastName?: string;
    mobile?: string;
    profileRole?: ProfileRole;
  }
): Promise<void> => {
  await UserModel.update(
    updates,
    { where: { id: userId, status: UserStatus.ACTIVE } }
  );
}

export const softDeleteUserById = async (userId: number): Promise<void> => {
  await UserModel.update(
    { status: UserStatus.DELETED },
    { where: { id: userId, status: ACTIVE_OR_INVITED } }
  );
  await UserRoleModel.update(
    { status: UserStatus.DELETED },
    { where: { userId, status: UserStatus.ACTIVE } }
  );
};

export const findAllActiveUsersByBrandId = async (
  brandId: number,
  excludeUserId?: number
): Promise<UserDetails[]> => {
  const where: any = { brandId, status: UserStatus.ACTIVE };
  if (excludeUserId) {
    where.id = { [Op.ne]: excludeUserId };
  }
  return await UserModel.findAll({
    where,
    attributes: ["id", "email", "firstName", "lastName"],
  });
};

export const findUsersByBrandId = async (
  brandId: number,
  page: number,
  limit: number
): Promise<{ rows: (UserDetails & { userRoles?: UserRoleDetails[] })[]; count: number }> => {
  const offset = (page - 1) * limit;
  const { rows, count } = await UserModel.findAndCountAll({
    where: { brandId, status: ACTIVE_OR_INVITED },
    limit,
    offset,
    order: [["createdAt", "DESC"]],
    attributes: ["id", "email", "firstName", "lastName", "mobile", "status", "profileRole", "createdAt"],
    include: [
      {
        model: UserRoleModel,
        as: "userRoles",
        where: { status: UserStatus.ACTIVE },
        required: false,
        attributes: ["role"],
      },
    ],
  });
  return { rows: rows as (UserDetails & { userRoles?: UserRoleDetails[] })[], count };
}