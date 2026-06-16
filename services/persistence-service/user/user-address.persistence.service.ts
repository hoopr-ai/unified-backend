import { UserAddressModel, type UserAddressAttributes } from "./schemas/user-address.schema";
import { AddressType } from "../../dto-service/modules.export";

export const upsertUserAddress = async (
  userId: number,
  addressType: AddressType,
  data: Omit<UserAddressAttributes, "id" | "userId" | "addressType" | "createdAt" | "updatedAt">,
): Promise<UserAddressAttributes> => {
  const [record] = await UserAddressModel.upsert({ userId, addressType, ...data });
  return record;
};

export const findUserAddress = async (
  userId: number,
  addressType: AddressType,
): Promise<UserAddressAttributes | null> => {
  return await UserAddressModel.findOne({ where: { userId, addressType } });
};

export const findAllUserAddresses = async (
  userId: number,
): Promise<{ business: UserAddressAttributes | null; billing: UserAddressAttributes | null }> => {
  const [business, billing] = await Promise.all([
    UserAddressModel.findOne({ where: { userId, addressType: AddressType.BUSINESS } }),
    UserAddressModel.findOne({ where: { userId, addressType: AddressType.BILLING } }),
  ]);
  return { business, billing };
};

export const deleteUserAddress = async (
  userId: number,
  addressType: AddressType,
): Promise<boolean> => {
  const deleted = await UserAddressModel.destroy({ where: { userId, addressType } });
  return deleted > 0;
};
