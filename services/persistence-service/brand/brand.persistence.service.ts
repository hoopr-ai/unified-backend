import { BrandModel, type BrandDetails } from "./schemas/modules.export";
import { sequelize } from "../database";

export const saveBrand = async (
  brandDetails: BrandDetails
): Promise<BrandDetails> => {
  const brand = await BrandModel.create(brandDetails);
  return brand;
};

export const findBrandById = async (
  id: number
): Promise<BrandDetails | null> => {
  const brand = await BrandModel.findByPk(id);
  return brand;
};

export const findBrandsByOrganizationId = async (
  organizationId: number
): Promise<BrandDetails[]> => {
  const brands = await BrandModel.findAll({
    where: { organizationId },
  });
  return brands;
};

export const findBrandByNameAndOrganization = async (
  name: string,
  organizationId: number
): Promise<BrandDetails | null> => {
  const brand = await BrandModel.findOne({
    where: { name, organizationId },
  });
  return brand;
};

export const getTokenBalance = async (brandId: number): Promise<number> => {
  const brand = await BrandModel.findByPk(brandId, {
    attributes: ["tokens"],
  });
  return brand?.tokens ?? 0;
};

export const addTokens = async (
  brandId: number,
  amount: number
): Promise<number> => {
  const [affectedCount] = await BrandModel.update(
    { tokens: sequelize.literal(`tokens + ${amount}`) },
    { where: { id: brandId } }
  );
  if (affectedCount === 0) {
    throw new Error("Brand not found");
  }
  const updatedBrand = await BrandModel.findByPk(brandId, {
    attributes: ["tokens"],
  });
  return updatedBrand?.tokens ?? 0;
};

export const deductToken = async (
  brandId: number,
  amount: number = 1
): Promise<{ success: boolean; remainingTokens: number }> => {
  const transaction = await sequelize.transaction();
  try {
    const brand = await BrandModel.findByPk(brandId, {
      attributes: ["id", "tokens"],
      lock: transaction.LOCK.UPDATE,
      transaction,
    });

    if (!brand) {
      await transaction.rollback();
      throw new Error("Brand not found");
    }

    if (brand.tokens < amount) {
      await transaction.rollback();
      return { success: false, remainingTokens: brand.tokens };
    }

    await BrandModel.update(
      { tokens: sequelize.literal(`tokens - ${amount}`) },
      { where: { id: brandId }, transaction }
    );

    await transaction.commit();

    const updatedBrand = await BrandModel.findByPk(brandId, {
      attributes: ["tokens"],
    });

    return { success: true, remainingTokens: updatedBrand?.tokens ?? 0 };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};
