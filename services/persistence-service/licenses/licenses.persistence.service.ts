import { LicenseModel, type LicenseDetails, VideoLinkModel } from "./schemas/modules.export";
import { TrackModel } from "../track/schemas/modules.export";
import { UserModel } from "../user/schemas/modules.export";
import { TrackArtistMappingModel, ArtistModel } from "../artists/modules.export";

export const createLicenseRecord = async (
  licenseDetails: LicenseDetails
): Promise<LicenseDetails> => {
  const license = await LicenseModel.create(licenseDetails);
  return license;
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
        include: [
          {
            model: TrackArtistMappingModel,
            as: "trackArtistMappings",
            required: false,
            where: { isPrimary: true },
            attributes: ["artistId", "isPrimary"],
            include: [
              {
                model: ArtistModel,
                as: "artist",
                attributes: ["id", "name"],
              },
            ],
          },
        ],
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
    distinct: true,
  });
  return { rows, count };
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
