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

export const getLicenseTypeById = async (
  id: string
): Promise<LicenseTypeModel | null> => {
  const licenseType = await LicenseTypeModel.findOne({
    where: {
      id,
      deleted: null,
    },
  });
  return licenseType;
};

export const getAllLicenseTypes = async (
  page: number = 1,
  limit: number = 50,
  includeDiscontinued: boolean = false
): Promise<{ rows: LicenseTypeModel[]; count: number }> => {
  const offset = (page - 1) * limit;
  const whereClause: Record<string, unknown> = {
    deleted: null,
  };

  if (!includeDiscontinued) {
    whereClause.discontinued = { [Op.or]: [false, null] };
  }

  const { rows, count } = await LicenseTypeModel.findAndCountAll({
    where: whereClause,
    order: [["createdAt", "DESC"]],
    limit,
    offset,
  });

  return { rows, count };
};

export const updateLicenseType = async (
  id: string,
  updates: Partial<LicenseTypeDetails>
): Promise<LicenseTypeModel | null> => {
  const licenseType = await LicenseTypeModel.findOne({
    where: {
      id,
      deleted: null,
    },
  });

  if (!licenseType) {
    return null;
  }

  await licenseType.update(updates);
  return licenseType;
};

export const softDeleteLicenseType = async (
  id: string
): Promise<boolean> => {
  const licenseType = await LicenseTypeModel.findOne({
    where: {
      id,
      deleted: null,
    },
  });

  if (!licenseType) {
    return false;
  }

  await licenseType.update({ deleted: new Date() });
  return true;
};

export const getLicenseTypeByType = async (
  type: LicenseTypeEnum
): Promise<LicenseTypeModel | null> => {
  const licenseType = await LicenseTypeModel.findOne({
    where: {
      type,
      deleted: null,
      discontinued: { [Op.or]: [false, null] },
    },
  });
  return licenseType;
};
