import { Op } from "sequelize";
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

// Separates the downloads list by content: 'sfx' → only SFX tracks, 'tracks' → everything else
export type LicenseHistoryCategory = "tracks" | "sfx";

export const getLicensesByBrandId = async (
  brandId: number,
  page: number = 1,
  limit: number = 50,
  category?: LicenseHistoryCategory,
): Promise<{ rows: LicenseModel[]; count: number }> => {
  const offset = (page - 1) * limit;

  // Filter on the joined track's type so old licenses of SFX tracks (created
  // before SFX became free) still land in the SFX bucket.
  let trackWhere: Record<string | symbol, unknown> | undefined;
  if (category === "sfx") {
    trackWhere = { type: { [Op.iLike]: "sfx" } };
  } else if (category === "tracks") {
    trackWhere = {
      [Op.or]: [{ type: { [Op.notILike]: "sfx" } }, { type: null }],
    };
  }

  const { rows, count } = await LicenseModel.findAndCountAll({
    where: { brandId },
    include: [
      {
        model: TrackModel,
        attributes: ["id", "trackCode", "name", "sourceLink", "ownerId", "type"],
        ...(trackWhere && { where: trackWhere, required: true }),
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
        attributes: ["id", "url", "status", "trackCode", "createdAt", "reelPostedAt"],
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

export const countLicensesWithMissingVideoLinks = async (
  brandId: number,
  requiredVideoLinksCount: number = 3
): Promise<number> => {
  const licenses = await LicenseModel.findAll({
    where: { brandId },
    include: [
      {
        model: VideoLinkModel,
        attributes: ["id"],
      },
      {
        model: TrackModel,
        attributes: ["type"],
        required: false,
      },
    ],
  });

  let missingCount = 0;
  for (const license of licenses) {
    // Free SFX downloads don't require video links
    if ((license.track?.type ?? "").toLowerCase() === "sfx") {
      continue;
    }
    const videoLinksCount = license.videoLinks?.length ?? 0;
    if (videoLinksCount < requiredVideoLinksCount) {
      missingCount++;
    }
  }

  return missingCount;
};

export const findLicensesByUserIdAndTrackCodes = async (
  userId: number,
  trackCodes: string[],
): Promise<{ trackCode: string; id: number }[]> => {
  const licenses = await LicenseModel.findAll({
    where: {
      userId,
      trackCode: { [Op.in]: trackCodes },
      type: "pay_per_track",
    },
    attributes: ["id", "trackCode"],
    order: [["createdAt", "DESC"]],
  });
  return licenses.map((l) => ({ id: l.id, trackCode: l.trackCode }));
};
