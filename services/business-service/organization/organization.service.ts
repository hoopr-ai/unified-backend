import {
  type CreateOrganizationRequestData,
  type CreateBrandRequestData,
  OrganizationStatus,
  BrandStatus,
} from "../../dto-service/modules.export";
import {
  saveOrganization,
  findOrganizationByName,
  findOrganizationById,
  saveBrand,
  findBrandByNameAndOrganization,
} from "../../persistence-service/exports";
import { sequelize } from "../../persistence-service/database";
import { AppError } from "../../helper-service/modules.export";
import { ResponseMessages } from "../../dto-service/constants/response-messages";

export interface OrganizationResponse {
  id: number;
  name: string;
  description?: string;
  status: OrganizationStatus;
  createdAt: Date;
}

export interface BrandResponse {
  id: number;
  organizationId: number;
  name: string;
  description?: string;
  status: BrandStatus;
  createdAt: Date;
}

export const createOrganizationService = async (
  data: CreateOrganizationRequestData,
  createdBy?: number
): Promise<OrganizationResponse> => {
  const { name, description, status } = data;

  const existingOrganization = await findOrganizationByName(name);
  if (existingOrganization) {
    throw new AppError(ResponseMessages.OrganizationAlreadyExists, 400);
  }

  const organization = await saveOrganization({
    name,
    description,
    status: status || OrganizationStatus.ACTIVE,
    createdBy,
    createdAt: new Date(),
  });

  return {
    id: organization.id!,
    name: organization.name,
    description: organization.description,
    status: organization.status,
    createdAt: organization.createdAt,
  };
};

export const createBrandService = async (
  data: CreateBrandRequestData,
  createdBy?: number
): Promise<BrandResponse> => {
  const { organizationId, name, description, status, insta_username } = data;

  const organization = await findOrganizationById(organizationId);
  if (!organization) {
    throw new AppError(ResponseMessages.OrganizationNotFound, 404);
  }

  const existingBrand = await findBrandByNameAndOrganization(name, organizationId);
  if (existingBrand) {
    throw new AppError(ResponseMessages.BrandAlreadyExists, 400);
  }

  const brand = await saveBrand({
    organizationId,
    name,
    description,
    status: status || BrandStatus.ACTIVE,
    createdBy,
    createdAt: new Date(),
  });

  // Update brands_info with insta_username if provided
  // The trigger automatically creates the brands_info row when brand is created
  if (insta_username) {
    await sequelize.query(
      `UPDATE brands_info SET insta_username = :insta_username WHERE brand_id = :brandId`,
      {
        replacements: { insta_username, brandId: brand.id },
      }
    );
  }

  return {
    id: brand.id!,
    organizationId: brand.organizationId,
    name: brand.name,
    description: brand.description,
    status: brand.status,
    createdAt: brand.createdAt,
  };
};
