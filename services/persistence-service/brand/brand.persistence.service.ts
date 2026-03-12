import { BrandModel, type BrandDetails } from "./schemas/modules.export";

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

export const getRestrictedOwnersByBrandId = async (
  brandId: number
): Promise<string[]> => {
  const brand = await BrandModel.findByPk(brandId, {
    attributes: ["restrictedOwners"],
  });
  const restrictedOwners = brand?.restrictedOwners;
  return Array.isArray(restrictedOwners) ? restrictedOwners : [];
};
