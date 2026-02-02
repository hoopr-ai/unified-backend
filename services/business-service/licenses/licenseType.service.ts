import {
  createLicenseType,
  getLicenseTypeById,
  getAllLicenseTypes,
  updateLicenseType,
  softDeleteLicenseType,
} from "../../persistence-service/licenses/modules.export";
import { LicenseTypeEnum } from "../../persistence-service/licenses/schemas/modules.export";
import { AppError } from "../../helper-service/modules.export";
import type {
  CreateLicenseTypeRequest,
  UpdateLicenseTypeRequest,
  LicenseTypeResponse,
  LicenseTypeListResponse,
  LicenseTypeEnumDTO,
} from "../../dto-service/licenses/modules.export";

const mapToResponse = (licenseType: {
  id: string;
  name?: string;
  type?: string;
  template?: string;
  template_buisness?: string;
  price?: number;
  discontinued?: boolean;
  createdAt: Date;
  updatedAt: Date;
}): LicenseTypeResponse => ({
  id: licenseType.id,
  name: licenseType.name,
  type: licenseType.type as LicenseTypeEnumDTO | undefined,
  template: licenseType.template,
  template_buisness: licenseType.template_buisness,
  price: licenseType.price,
  discontinued: licenseType.discontinued,
  createdAt: licenseType.createdAt,
  updatedAt: licenseType.updatedAt,
});

export const createLicenseTypeService = async (
  data: CreateLicenseTypeRequest
): Promise<LicenseTypeResponse> => {
  const { name, type, template, template_buisness, price } = data;

  if (price < 0) {
    throw new AppError("Price must be a non-negative number", 400);
  }

  const licenseType = await createLicenseType({
    name,
    type: type as unknown as LicenseTypeEnum,
    template,
    template_buisness,
    price,
    discontinued: false,
  });

  return mapToResponse(licenseType);
};

export const getLicenseTypeByIdService = async (
  id: string
): Promise<LicenseTypeResponse> => {
  const licenseType = await getLicenseTypeById(id);

  if (!licenseType) {
    throw new AppError("License type not found", 404);
  }

  return mapToResponse(licenseType);
};

export const getAllLicenseTypesService = async (
  page: number = 1,
  limit: number = 50,
  includeDiscontinued: boolean = false
): Promise<LicenseTypeListResponse> => {
  const { rows, count } = await getAllLicenseTypes(page, limit, includeDiscontinued);

  const licenseTypes: LicenseTypeResponse[] = rows.map(mapToResponse);

  return {
    licenseTypes,
    pagination: {
      page,
      limit,
      totalItems: count,
      totalPages: Math.ceil(count / limit),
    },
  };
};

export const updateLicenseTypeService = async (
  id: string,
  data: UpdateLicenseTypeRequest
): Promise<LicenseTypeResponse> => {
  const { name, type, template, template_buisness, price, discontinued } = data;

  if (price !== undefined && price < 0) {
    throw new AppError("Price must be a non-negative number", 400);
  }

  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = name;
  if (type !== undefined) updates.type = type as unknown as LicenseTypeEnum;
  if (template !== undefined) updates.template = template;
  if (template_buisness !== undefined) updates.template_buisness = template_buisness;
  if (price !== undefined) updates.price = price;
  if (discontinued !== undefined) updates.discontinued = discontinued;

  const licenseType = await updateLicenseType(id, updates);

  if (!licenseType) {
    throw new AppError("License type not found", 404);
  }

  return mapToResponse(licenseType);
};

export const deleteLicenseTypeService = async (
  id: string
): Promise<{ message: string }> => {
  const deleted = await softDeleteLicenseType(id);

  if (!deleted) {
    throw new AppError("License type not found", 404);
  }

  return { message: "License type deleted successfully" };
};
