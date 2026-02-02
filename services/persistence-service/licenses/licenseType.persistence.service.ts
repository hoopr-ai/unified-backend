import { Op } from "sequelize";
import {
  LicenseTypeModel,
  type LicenseTypeDetails,
  LicenseTypeEnum,
} from "./schemas/modules.export";

export const createLicenseType = async (
  licenseTypeDetails: Partial<LicenseTypeDetails>
): Promise<LicenseTypeModel> => {
  const licenseType = await LicenseTypeModel.create(
    licenseTypeDetails as LicenseTypeDetails
  );
  return licenseType;
};
