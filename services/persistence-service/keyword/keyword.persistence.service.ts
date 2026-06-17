import { Op } from "sequelize";
import { KeywordModel } from "./schemas/keyword.schema";
import { TrackKeywordMappingModel } from "./schemas/track-keyword-mapping.schema";
import { TrackModel } from "../track/schemas/track.schema";
import { TrackArtistMappingModel, ArtistModel } from "../artists/modules.export";
import { SkuModel, SkuType } from "../sku/modules.export";
import {
  PaginatedRawTracks,
  RawTrackWithMappings,
} from "../../dto-service/modules.export";

export const findKeywordIdsByOccasionId = async (
  occasionId: number,
): Promise<string[]> => {
  const keywords = await KeywordModel.findAll({
    where: { occasionId },
    attributes: ["id"],
  });
  return keywords.map((k) => k.id);
};

export const findTracksByKeywordIds = async (
  keywordIds: string[],
  page: number,
  limit: number,
  ownerIds?: string[],
  excludeOwnerIds?: string[],
): Promise<PaginatedRawTracks> => {
  if (keywordIds.length === 0) {
    return { rows: [], count: 0, page, limit };
  }

  const offset = (page - 1) * limit;
  const conditions: any[] = [];

  const includeOwners = Array.isArray(ownerIds) ? ownerIds : [];
  const excludeOwners = Array.isArray(excludeOwnerIds) ? excludeOwnerIds : [];

  if (includeOwners.length) {
    conditions.push({ ownerId: { [Op.overlap]: includeOwners } });
  }
  if (excludeOwners.length) {
    conditions.push({
      [Op.not]: { ownerId: { [Op.overlap]: excludeOwners } },
    });
  }

  const trackWhere: any = { status: "ACTIVE" };
  if (conditions.length) {
    trackWhere[Op.and] = conditions;
  }

  const { count, rows: mappings } =
    await TrackKeywordMappingModel.findAndCountAll({
      where: { keywordId: { [Op.in]: keywordIds } },
      limit,
      offset,
      distinct: true,
      col: "id",
      include: [
        {
          model: TrackModel,
          as: "track",
          where: trackWhere,
          required: true,
          include: [
            {
              model: TrackArtistMappingModel,
              as: "trackArtistMappings",
              required: false,
              include: [
                {
                  model: ArtistModel,
                  as: "artist",
                  attributes: ["id", "name", "type"],
                  required: false,
                },
              ],
            },
            {
              model: SkuModel,
              as: "skus",
              required: false,
              where: { skuType: SkuType.STANDARD, active: "Y" },
              attributes: ["token"],
            },
          ],
        },
      ],
    });

  const tracks: RawTrackWithMappings[] = mappings
    .filter((m) => m.track)
    .map((m) => (m.track as TrackModel).toJSON() as RawTrackWithMappings);

  return { rows: tracks, count, page, limit };
};
