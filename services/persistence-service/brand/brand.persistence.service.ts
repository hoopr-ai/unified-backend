import { BrandModel, type BrandDetails } from "./schemas/modules.export";
import { Op } from "sequelize";

export interface BrandSearchResult {
  id: number;
  name: string;
}

// Search brands by name or ID for autocomplete
export const searchBrands = async (
  searchQuery: string,
  limit: number = 20,
): Promise<BrandSearchResult[]> => {
  if (!searchQuery || searchQuery.trim().length === 0) {
    return [];
  }

  const searchTerm = searchQuery.trim();

  // Check if searching by ID (numeric)
  const isNumericSearch = /^\d+$/.test(searchTerm);

  let whereClause: any;
  if (isNumericSearch) {
    whereClause = {
      [Op.or]: [
        { id: parseInt(searchTerm, 10) },
        { name: { [Op.iLike]: `%${searchTerm}%` } },
      ],
    };
  } else {
    const escapedTerm = searchTerm.replace(/[%_\\]/g, '\\$&');
    whereClause = {
      name: { [Op.iLike]: `%${escapedTerm}%` },
    };
  }

  const brands = await BrandModel.findAll({
    where: whereClause,
    attributes: ["id", "name"],
    order: [["name", "ASC"]],
    limit,
    raw: true,
  });

  return brands.map((brand: any) => ({
    id: Number(brand.id),
    name: brand.name,
  }));
};

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

export const updateBrand = async (
  id: number,
  updates: Partial<BrandDetails>,
): Promise<void> => {
  await BrandModel.update(updates, { where: { id } });
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

export const getRestrictedTrackTiersByBrandId = async (
  brandId: number
): Promise<string[]> => {
  const brand = await BrandModel.findByPk(brandId, {
    attributes: ["restrictedTrackTiers"],
  });
  const restrictedTrackTiers = brand?.restrictedTrackTiers;
  return Array.isArray(restrictedTrackTiers) ? restrictedTrackTiers : [];
};

// Get all brand IDs for background processing
export const getAllBrandIds = async (): Promise<number[]> => {
  const brands = await BrandModel.findAll({
    attributes: ["id"],
    raw: true,
  });
  return brands.map((brand: { id: number }) => brand.id);
};
