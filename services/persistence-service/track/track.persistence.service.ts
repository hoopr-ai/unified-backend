import { TrackModel } from "./schemas/track.schema";
import {
  TrackArtistMappingModel,
  ArtistModel,
} from "../artists/modules.export";
import {
  PaginatedRawTracks,
  RawTrackWithMappings,
} from "../../dto-service/modules.export";
import { TrackFilterMappingModel, FilterModel } from "../exports";
import { SkuModel, SkuType } from "../sku/modules.export";
import { Op } from "sequelize";

// Reusable include configuration for artist mappings
const getArtistInclude = () => [
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
];

// Include standard SKU for listing APIs (only token needed)
const getStandardSkuInclude = () => [
  {
    model: SkuModel,
    as: "skus",
    required: false,
    where: { skuType: SkuType.STANDARD, active: "Y" },
    attributes: ["token"],
  },
];

// Include all SKUs for track details API
const getAllSkusInclude = () => [
  {
    model: SkuModel,
    as: "skus",
    required: false,
    where: { active: "Y" },
    attributes: ["id", "name", "costPrice", "sellingPrice", "gstPercent", "maxUsage", "description", "token", "skuType"],
  },
];

// Include filter mappings for track details API
const getFilterMappingsInclude = () => [
  {
    model: TrackFilterMappingModel,
    as: "trackFilterMappings",
    required: false,
    include: [
      {
        model: FilterModel,
        as: "filter",
        attributes: ["id", "name", "name_slug", "type"],
        required: false,
      },
    ],
  },
];

export const findAllTracks = async (
  page: number,
  limit: number,
  whereClause: Record<string, unknown> = {},
  ownerIds?: string[],
): Promise<PaginatedRawTracks> => {
  const offset = (page - 1) * limit;

  if (ownerIds && ownerIds.length > 0) {
    whereClause.ownerId = { [Op.overlap]: ownerIds };
  }

  const { count, rows } = await TrackModel.findAndCountAll({
    where: whereClause,
    order: [["createdAt", "DESC"]],
    limit,
    offset,
    distinct: true,
    col: "id",
    include: [...getArtistInclude(), ...getStandardSkuInclude()],
  });

  return {
    rows: rows.map((track) => track.toJSON() as RawTrackWithMappings),
    count,
    page,
    limit,
  };
};

export const findTracksByTrackCodes = async (
  trackCodes: string[],
  page: number,
  limit: number,
  ownerIds?: string[],
): Promise<PaginatedRawTracks> => {
  const offset = (page - 1) * limit;

  const whereClause: Record<string, unknown> = { trackCode: trackCodes };
  if (ownerIds && ownerIds.length > 0) {
    whereClause.ownerId = { [Op.overlap]: ownerIds };
  }

  const { count, rows } = await TrackModel.findAndCountAll({
    where: whereClause,
    order: [["createdAt", "DESC"]],
    limit,
    offset,
    distinct: true,
    col: "id",
    include: [...getArtistInclude(), ...getStandardSkuInclude()],
  });

  return {
    rows: rows.map((track) => track.toJSON() as RawTrackWithMappings),
    count,
    page,
    limit,
  };
};

export interface GetTracksByFilterParams {
  filterIds: string[];
  page: number;
  limit: number;
  ownerIds?: string[];
}

export interface RawFilterMappingResult {
  trackId?: string;
  track: RawTrackWithMappings | null;
}

export interface PaginatedRawFilterTracks {
  rows: RawFilterMappingResult[];
  count: number;
  page: number;
  limit: number;
}

export const findTrackByTrackCode = async (
  trackCode: string,
): Promise<RawTrackWithMappings | null> => {
  const track = await TrackModel.findOne({
    where: { trackCode },
    include: [...getArtistInclude(), ...getAllSkusInclude(), ...getFilterMappingsInclude()],
  });

  return track ? (track.toJSON() as RawTrackWithMappings) : null;
};

export const findTracksByFilter = async (
  params: GetTracksByFilterParams,
): Promise<PaginatedRawFilterTracks> => {
  const { filterIds, page, limit, ownerIds } = params;
  const offset = (page - 1) * limit;

  const trackWhere: Record<string, unknown> = {};
  if (ownerIds && ownerIds.length > 0) {
    trackWhere.ownerId = { [Op.overlap]: ownerIds };
  }

  const { count, rows: mappings } =
    await TrackFilterMappingModel.findAndCountAll({
      where: { filterId: filterIds },
      limit,
      offset,
      distinct: true,
      col: "id",
      include: [
        {
          model: TrackModel,
          as: "track",
          where: Object.keys(trackWhere).length > 0 ? trackWhere : undefined,
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

  return {
    rows: mappings.map((mapping) => ({
      trackId: mapping.trackId,
      track: mapping.track ? (mapping.track.toJSON() as RawTrackWithMappings) : null,
    })),
    count,
    page,
    limit,
  };
};
