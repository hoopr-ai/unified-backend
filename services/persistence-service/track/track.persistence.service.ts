import { TrackModel } from "./schemas/track.schema";
import {
  TrackArtistMappingModel,
  ArtistModel,
} from "../artists/modules.export";
import {
  PaginatedRawTracks,
  RawTrackWithMappings,
} from "../../dto-service/modules.export";
import { TrackFilterMappingModel } from "../exports";
import { SkuModel, SkuType } from "../sku/modules.export";

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

export const findAllTracks = async (
  page: number,
  limit: number,
  whereClause: Record<string, unknown> = {},
): Promise<PaginatedRawTracks> => {
  const offset = (page - 1) * limit;

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
): Promise<PaginatedRawTracks> => {
  const offset = (page - 1) * limit;

  const { count, rows } = await TrackModel.findAndCountAll({
    where: { trackCode: trackCodes },
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
  filterId: string;
  page: number;
  limit: number;
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
    include: [...getArtistInclude(), ...getAllSkusInclude()],
  });

  return track ? (track.toJSON() as RawTrackWithMappings) : null;
};

export const findTracksByFilter = async (
  params: GetTracksByFilterParams,
): Promise<PaginatedRawFilterTracks> => {
  const { filterId, page, limit } = params;
  const offset = (page - 1) * limit;

  const { count, rows: mappings } =
    await TrackFilterMappingModel.findAndCountAll({
      where: { filterId },
      limit,
      offset,
      include: [
        {
          model: TrackModel,
          as: "track",
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
