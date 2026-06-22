import {
  type CreateOrganizationRequestData,
  type CreateBrandRequestData,
  type UpdateOrganizationRequestData,
  type UpdateBrandRequestData,
  type BrandDetailResponseData,
  OrganizationStatus,
  BrandStatus,
  UNAUTHENTICATED_RESTRICTED_OWNER_NAMES,
} from "../../dto-service/modules.export";
import {
  saveOrganization,
  findOrganizationByName,
  findOrganizationById,
  findAllOrganizations,
  updateOrganizationById,
  saveBrand,
  findBrandByNameAndOrganization,
  findBrandsByOrganizationId,
  findBrandById,
  updateBrandById,
  getOwnerIdsByNames,
  getOwnersByIds,
  getDistinctTrackTiers,
  findUsersByBrandId,
} from "../../persistence-service/exports";
import { sequelize } from "../../persistence-service/database";
import { QueryTypes } from "sequelize";
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

  // Resolve restricted owner names to owner IDs
  let restrictedOwnerIds: string[] | undefined;
  if (UNAUTHENTICATED_RESTRICTED_OWNER_NAMES.length > 0) {
    const resolvedIds = await getOwnerIdsByNames(UNAUTHENTICATED_RESTRICTED_OWNER_NAMES);
    restrictedOwnerIds = resolvedIds.length > 0 ? resolvedIds : undefined;
  }

  const brand = await saveBrand({
    organizationId,
    name,
    description,
    status: status || BrandStatus.ACTIVE,
    createdBy,
    restrictedOwners: restrictedOwnerIds,
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

// ─── Listing & Editing (internal client-credentials console) ──────────────────

interface Pagination {
  page: number;
  limit: number;
  totalItems: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

const buildPagination = (
  page: number,
  limit: number,
  totalItems: number
): Pagination => {
  const totalPages = Math.ceil(totalItems / limit);
  return {
    page,
    limit,
    totalItems,
    totalPages,
    hasNextPage: page < totalPages,
    hasPrevPage: page > 1,
  };
};

const readInstaUsername = async (brandId: number): Promise<string | undefined> => {
  const [row] = (await sequelize.query(
    `SELECT insta_username FROM brands_info WHERE brand_id = :brandId LIMIT 1`,
    { replacements: { brandId }, type: QueryTypes.SELECT }
  )) as { insta_username?: string }[];
  return row?.insta_username ?? undefined;
};

export const listOrganizationsService = async (
  pageStr?: string,
  limitStr?: string,
  search?: string
): Promise<{ organizations: OrganizationResponse[]; pagination: Pagination }> => {
  const page = Math.max(parseInt(pageStr || "1", 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(limitStr || "50", 10) || 50, 1), 200);
  const offset = (page - 1) * limit;

  const { rows, count } = await findAllOrganizations(limit, offset, search);

  return {
    organizations: rows.map((org) => ({
      id: org.id!,
      name: org.name,
      description: org.description,
      status: org.status,
      createdAt: org.createdAt,
    })),
    pagination: buildPagination(page, limit, count),
  };
};

export const updateOrganizationService = async (
  organizationId: number,
  data: UpdateOrganizationRequestData
): Promise<OrganizationResponse> => {
  const organization = await findOrganizationById(organizationId);
  if (!organization) {
    throw new AppError(ResponseMessages.OrganizationNotFound, 404);
  }

  // Guard against duplicate names when renaming
  if (data.name && data.name !== organization.name) {
    const existing = await findOrganizationByName(data.name);
    if (existing && existing.id !== organizationId) {
      throw new AppError(ResponseMessages.OrganizationAlreadyExists, 400);
    }
  }

  await updateOrganizationById(organizationId, {
    name: data.name,
    description: data.description,
    status: data.status,
  });

  const updated = await findOrganizationById(organizationId);
  return {
    id: updated!.id!,
    name: updated!.name,
    description: updated!.description,
    status: updated!.status,
    createdAt: updated!.createdAt,
  };
};

export const listBrandsByOrganizationService = async (
  organizationId: number
): Promise<BrandResponse[]> => {
  const organization = await findOrganizationById(organizationId);
  if (!organization) {
    throw new AppError(ResponseMessages.OrganizationNotFound, 404);
  }

  const brands = await findBrandsByOrganizationId(organizationId);
  return brands.map((brand) => ({
    id: brand.id!,
    organizationId: brand.organizationId,
    name: brand.name,
    description: brand.description,
    status: brand.status,
    createdAt: brand.createdAt,
  }));
};

export const getBrandDetailService = async (
  brandId: number
): Promise<BrandDetailResponseData> => {
  const brand = await findBrandById(brandId);
  if (!brand) {
    throw new AppError(ResponseMessages.BrandNotFound, 404);
  }

  const restrictedOwnerIds = Array.isArray(brand.restrictedOwners)
    ? brand.restrictedOwners
    : [];
  const restrictedOwners = restrictedOwnerIds.length
    ? await getOwnersByIds(restrictedOwnerIds)
    : [];

  return {
    id: brand.id!,
    organizationId: brand.organizationId,
    name: brand.name,
    description: brand.description,
    status: brand.status,
    insta_username: await readInstaUsername(brand.id!),
    restrictedTrackTiers: Array.isArray(brand.restrictedTrackTiers)
      ? brand.restrictedTrackTiers
      : [],
    restrictedOwners,
    createdAt: brand.createdAt,
  };
};

export const updateBrandService = async (
  brandId: number,
  data: UpdateBrandRequestData
): Promise<BrandDetailResponseData> => {
  const brand = await findBrandById(brandId);
  if (!brand) {
    throw new AppError(ResponseMessages.BrandNotFound, 404);
  }

  // Guard against duplicate names within the same organization when renaming
  if (data.name && data.name !== brand.name) {
    const existing = await findBrandByNameAndOrganization(
      data.name,
      brand.organizationId
    );
    if (existing && existing.id !== brandId) {
      throw new AppError(ResponseMessages.BrandAlreadyExists, 400);
    }
  }

  await updateBrandById(brandId, {
    name: data.name,
    description: data.description,
    status: data.status,
    restrictedOwners: data.restrictedOwners,
    restrictedTrackTiers: data.restrictedTrackTiers,
  });

  if (data.insta_username !== undefined) {
    await sequelize.query(
      `UPDATE brands_info SET insta_username = :insta_username WHERE brand_id = :brandId`,
      { replacements: { insta_username: data.insta_username, brandId } }
    );
  }

  return getBrandDetailService(brandId);
};

export const listUsersByBrandService = async (
  brandId: number,
  pageStr?: string,
  limitStr?: string
): Promise<{
  users: {
    id: number;
    email: string;
    firstName?: string;
    lastName?: string;
    mobile?: string;
    status?: string;
    role?: string;
  }[];
  pagination: Pagination;
}> => {
  const brand = await findBrandById(brandId);
  if (!brand) {
    throw new AppError(ResponseMessages.BrandNotFound, 404);
  }

  const page = Math.max(parseInt(pageStr || "1", 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(limitStr || "50", 10) || 50, 1), 200);

  const { rows, count } = await findUsersByBrandId(brandId, page, limit);

  return {
    users: rows.map((user: any) => ({
      id: user.id!,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      mobile: user.mobile,
      status: user.status,
      role: user.userRoles?.[0]?.role,
    })),
    pagination: buildPagination(page, limit, count),
  };
};

export const listTrackTiersService = async (): Promise<string[]> => {
  return getDistinctTrackTiers();
};
