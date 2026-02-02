import { createLicenseType } from "../../persistence-service/licenses/modules.export";
import { LicenseTypeEnum } from "../../persistence-service/licenses/schemas/modules.export";
import { AppError } from "../../helper-service/modules.export";
import type {
  CreateLicenseTypeRequest,
  LicenseTypeResponse,
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
