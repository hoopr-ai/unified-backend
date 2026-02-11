import { LicenseModel, type LicenseDetails, VideoLinkModel } from "./schemas/modules.export";
import { TrackModel } from "../track/schemas/modules.export";
import { UserModel } from "../user/schemas/modules.export";

export const createLicenseRecord = async (
  licenseDetails: LicenseDetails
): Promise<LicenseDetails> => {
  const license = await LicenseModel.create(licenseDetails);
  return license;
};

export const getLicensesByUserId = async (
  userId: number,
  page: number = 1,
  limit: number = 50
): Promise<{ rows: LicenseModel[]; count: number }> => {
  const offset = (page - 1) * limit;
  const { rows, count } = await LicenseModel.findAndCountAll({
    where: { userId },
    include: [
      {
        model: TrackModel,
        attributes: ["id", "trackCode", "name", "sourceLink"],
      },
    ],
    order: [["licensedAt", "DESC"]],
    limit,
    offset,
  });
  return { rows, count };
};

export const getLicensesByBrandId = async (
  brandId: number,
  page: number = 1,
  limit: number = 50
): Promise<{ rows: LicenseModel[]; count: number }> => {
  const offset = (page - 1) * limit;
  const { rows, count } = await LicenseModel.findAndCountAll({
    where: { brandId },
    include: [
      {
        model: TrackModel,
        attributes: ["id", "trackCode", "name", "sourceLink", "ownerId"],
      },
      {
        model: UserModel,
        attributes: ["id", "email", "firstName", "lastName"],
      },
      {
        model: VideoLinkModel,
        attributes: ["id", "url", "status", "trackCode", "createdAt"],
      },
    ],
    order: [["licensedAt", "DESC"]],
    limit,
    offset,
  });
  return { rows, count };
};

export const getLicenseCountByTrackId = async (
  trackId: string
): Promise<number> => {
  const count = await LicenseModel.count({
    where: { trackId },
  });
  return count;
};

export const getTotalLicensesByBrandId = async (
  brandId: number
): Promise<number> => {
  const count = await LicenseModel.count({
    where: { brandId },
  });
  return count;
};

export const getTotalLicensesByUserId = async (
  userId: number
): Promise<number> => {
  const count = await LicenseModel.count({
    where: { userId },
  });
  return count;
};
