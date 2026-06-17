import { UserAddressModel, type UserAddressAttributes } from "./schemas/user-address.schema";
import { AddressType } from "../../dto-service/modules.export";

type AddressData = Omit<UserAddressAttributes, "id" | "userId" | "addressType" | "createdAt" | "updatedAt">;

export const upsertUserAddress = async (
  userId: number,
  addressType: AddressType,
  data: AddressData,
): Promise<UserAddressAttributes> => {
  const existing = await UserAddressModel.findOne({ where: { userId, addressType } });
  if (existing) {
    await existing.update(data);
    return existing.get({ plain: true });
  }
  const created = await UserAddressModel.create({ userId, addressType, ...data });
  return created.get({ plain: true });
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
