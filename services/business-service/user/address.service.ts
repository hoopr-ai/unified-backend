import { AppError } from "../../helper-service/modules.export";
import { AddressType } from "../../dto-service/modules.export";
import {
  upsertUserAddress,
  findAllUserAddresses,
  deleteUserAddress,
  type UserAddressAttributes,
} from "../../persistence-service/exports";

export interface UpsertBusinessAddressData {
  addressLine1: string;
  addressLine2?: string;
  country: string;
  state: string;
  city: string;
  postalCode: string;
  pan?: string;
  gstin?: string;
}

export interface UpsertBillingAddressData {
  addressLine1: string;
  addressLine2?: string;
  country: string;
  state: string;
  city: string;
  postalCode: string;
}

export interface AddressesResponse {
  business: UserAddressAttributes | null;
  billing: UserAddressAttributes | null;
}

export const getAddressesService = async (
  userId: number,
): Promise<AddressesResponse> => {
  return await findAllUserAddresses(userId);
};

export const upsertBusinessAddressService = async (
  userId: number,
  data: UpsertBusinessAddressData,
): Promise<UserAddressAttributes> => {
  return await upsertUserAddress(userId, AddressType.BUSINESS, {
    addressLine1: data.addressLine1,
    addressLine2: data.addressLine2 ?? null,
    country: data.country,
    state: data.state,
    city: data.city,
    postalCode: data.postalCode,
    pan: data.pan ?? null,
    gstin: data.gstin ?? null,
  });
};

export const upsertBillingAddressService = async (
  userId: number,
  data: UpsertBillingAddressData,
): Promise<UserAddressAttributes> => {
  return await upsertUserAddress(userId, AddressType.BILLING, {
    addressLine1: data.addressLine1,
    addressLine2: data.addressLine2 ?? null,
    country: data.country,
    state: data.state,
    city: data.city,
    postalCode: data.postalCode,
  });
};

export const deleteAddressService = async (
  userId: number,
  addressType: AddressType,
): Promise<void> => {
  const deleted = await deleteUserAddress(userId, addressType);
  if (!deleted) {
    throw new AppError("Address not found", 404);
  }
};
