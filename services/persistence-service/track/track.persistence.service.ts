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
import { CampaignModel, CampaignStatus } from "../campaign/modules.export";
import { SoundProjectModel } from "../project/modules.export";
import { Op, Sequelize } from "sequelize";

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

// Include campaign for listing APIs (when ACTIVE)
const getActiveCampaignInclude = () => {
  const now = new Date();
  return [
    {
      model: CampaignModel,
      as: "campaign",
      required: false,
      attributes: ["amount", "amountType", "currentUsage", "totalUsage", "validFrom", "validTill"],
      where: {
        status: CampaignStatus.ACTIVE,
        validFrom: { [Op.lte]: now },
        validTill: { [Op.gte]: now },
      },
    },
  ];
};

// Helper function to mark expired campaigns as EXPIRED
const markExpiredCampaigns = async (): Promise<void> => {
  const now = new Date();
  await CampaignModel.update(
    { status: CampaignStatus.EXPIRED },
    {
      where: {
        status: CampaignStatus.ACTIVE,
        validTill: { [Op.lt]: now },
      },
    }
  );
};

export const findAllTracks = async (
  page: number,
  limit: number,
  whereClause: Record<string, unknown> = {},
  ownerIds?: string[],
  excludeOwnerIds?: string[],
  sortByPopular?: boolean,
  campaignFilter?: boolean,
  excludeTiers?: string[],
): Promise<PaginatedRawTracks> => {

  const offset = (page - 1) * limit;
  const conditions: any[] = [];

  const includeOwners = Array.isArray(ownerIds) ? ownerIds : [];
  const excludeOwners = Array.isArray(excludeOwnerIds) ? excludeOwnerIds : [];
  const tiersToExclude = Array.isArray(excludeTiers) ? excludeTiers : [];

  if (includeOwners.length) {
    conditions.push({
      ownerId: {
        [Op.overlap]: includeOwners
      }
    });
  }

  if (excludeOwners.length) {
    conditions.push({
      [Op.not]: {
        ownerId: {
          [Op.overlap]: excludeOwners
        }
      }
    });
  }

  if (tiersToExclude.length) {
    conditions.push({
      [Op.or]: [
        { tier: { [Op.notIn]: tiersToExclude } },
        { tier: null }
      ]
    });
  }

  const finalWhereClause: any = {
    ...whereClause,
    status: "ACTIVE"
  };

  // If campaign filter is enabled, add campaignId not null condition
  if (campaignFilter === true) {
    // First, mark any expired campaigns
    await markExpiredCampaigns();

    finalWhereClause.campaignId = { [Op.ne]: null };
  }

  if (conditions.length) {
    finalWhereClause[Op.and] = conditions;
  }

  // Sort by jioSaavanStream numerically (descending) when popular, then by createdAt
  const orderClause: any[] = sortByPopular
    ? [
        [Sequelize.literal('CAST("jioSaavanStream" AS BIGINT)'), 'DESC NULLS LAST'],
        ['createdAt', 'DESC'],
      ]
    : [['createdAt', 'DESC']];

  // Build include array
  const includeArray: any[] = [...getArtistInclude(), ...getStandardSkuInclude()];

  // Add campaign include when filtering by campaign (required) or always include active campaign details
  if (campaignFilter === true) {
    const now = new Date();
    includeArray.push({
      model: CampaignModel,
      as: "campaign",
      required: true,
      attributes: ["amount", "amountType", "currentUsage", "totalUsage", "validFrom", "validTill"],
      where: {
        status: CampaignStatus.ACTIVE,
        validFrom: { [Op.lte]: now },
        validTill: { [Op.gte]: now },
      },
    });
  } else {
    // Include active campaign details (optional) for all tracks with campaignId
    includeArray.push(...getActiveCampaignInclude());
  }

  console.log("findAllTracks finalWhereClause:", finalWhereClause);
  console.log("findAllTracks releaseDate in finalWhere:", finalWhereClause.releaseDate);

  const { count, rows } = await TrackModel.findAndCountAll({
    where: finalWhereClause,
    order: orderClause,
    limit,
    offset,
    distinct: true,
    col: "id",
    include: includeArray,
    logging: (sql: string) => console.log("SQL:", sql),
  });

  // Debug: Log raw hookTimings data from first few tracks
  if (rows.length > 0) {
    rows.slice(0, 3).forEach((track, idx) => {
      const rawVal = track.getDataValue("hookTimings");
      const jsonVal = track.toJSON();
      console.log(`[DEBUG findAllTracks] Track ${idx} (${track.trackCode}): rawHookTimings=`, rawVal, `toJSON.hookTimings=`, (jsonVal as any).hookTimings);
    });
  }

  return {
    rows: rows.map(track => track.toJSON() as RawTrackWithMappings),
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
  excludeOwnerIds?: string[],
  excludeTiers?: string[],
): Promise<PaginatedRawTracks> => {

  const offset = (page - 1) * limit;
  const conditions: any[] = [];

  const includeOwners = Array.isArray(ownerIds) ? ownerIds : [];
  const excludeOwners = Array.isArray(excludeOwnerIds) ? excludeOwnerIds : [];
  const tiersToExclude = Array.isArray(excludeTiers) ? excludeTiers : [];

  if (includeOwners.length) {
    conditions.push({
      ownerId: {
        [Op.overlap]: includeOwners
      }
    });
  }

  if (excludeOwners.length) {
    conditions.push({
      [Op.not]: {
        ownerId: {
          [Op.overlap]: excludeOwners
        }
      }
    });
  }

  if (tiersToExclude.length) {
    conditions.push({
      [Op.or]: [
        { tier: { [Op.notIn]: tiersToExclude } },
        { tier: null }
      ]
    });
  }

  const whereClause: any = {
    trackCode: { [Op.in]: trackCodes },
    status: "ACTIVE"
  };

  if (conditions.length) {
    whereClause[Op.and] = conditions;
  }

  const { count, rows } = await TrackModel.findAndCountAll({
    where: whereClause,
    order: [["createdAt", "DESC"]],
    limit,
    offset,
    distinct: true,
    col: "id",
    include: [...getArtistInclude(), ...getStandardSkuInclude(), ...getActiveCampaignInclude()],
  });

  // Debug: Log raw hookTimings data from first few tracks
  if (rows.length > 0) {
    rows.slice(0, 3).forEach((track, idx) => {
      const rawVal = track.getDataValue("hookTimings");
      const jsonVal = track.toJSON();
      console.log(`[DEBUG findTracksByTrackCodes] Track ${idx} (${track.trackCode}): rawHookTimings=`, rawVal, `toJSON.hookTimings=`, (jsonVal as any).hookTimings);
    });
  }

  return {
    rows: rows.map(track => track.toJSON() as RawTrackWithMappings),
    count,
    page,
    limit,
  };
};

// Returns only the subset of IDs that exist as ACTIVE tracks (excluding restricted owners and tiers)
export const findActiveTrackIdsByIds = async (
  ids: string[],
  excludeOwnerIds?: string[],
  excludeTiers?: string[],
): Promise<Set<string>> => {
  if (ids.length === 0) return new Set();

  const whereClause: any = { id: { [Op.in]: ids }, status: "ACTIVE" };

  const excludeOwners = Array.isArray(excludeOwnerIds) ? excludeOwnerIds : [];
  const tiersToExclude = Array.isArray(excludeTiers) ? excludeTiers : [];
  const conditions: any[] = [];

  if (excludeOwners.length > 0) {
    conditions.push({ [Op.not]: { ownerId: { [Op.overlap]: excludeOwners } } });
  }

  if (tiersToExclude.length > 0) {
    conditions.push({
      [Op.or]: [
        { tier: { [Op.notIn]: tiersToExclude } },
        { tier: null }
      ]
    });
  }

  if (conditions.length > 0) {
    whereClause[Op.and] = conditions;
  }

  const rows = await TrackModel.findAll({
    where: whereClause,
    attributes: ["id"],
    raw: true,
  });

  return new Set(rows.map((r: any) => r.id));
};

export const findAllTracksByIds = async (
  ids: string[],
  excludeOwnerIds?: string[],
  excludeTiers?: string[],
): Promise<RawTrackWithMappings[]> => {
  if (ids.length === 0) return [];

  const whereClause: any = { id: { [Op.in]: ids }, status: "ACTIVE" };

  const excludeOwners = Array.isArray(excludeOwnerIds) ? excludeOwnerIds : [];
  const tiersToExclude = Array.isArray(excludeTiers) ? excludeTiers : [];
  const conditions: any[] = [];

  if (excludeOwners.length > 0) {
    conditions.push({ [Op.not]: { ownerId: { [Op.overlap]: excludeOwners } } });
  }

  if (tiersToExclude.length > 0) {
    conditions.push({
      [Op.or]: [
        { tier: { [Op.notIn]: tiersToExclude } },
        { tier: null }
      ]
    });
  }

  if (conditions.length > 0) {
    whereClause[Op.and] = conditions;
  }

  const rows = await TrackModel.findAll({
    where: whereClause,
    order: [["createdAt", "DESC"]],
    include: [...getArtistInclude(), ...getStandardSkuInclude(), ...getActiveCampaignInclude()],
  });

  // Debug: Log hookTimings for first few tracks
  if (rows.length > 0) {
    rows.slice(0, 3).forEach((track, idx) => {
      const rawVal = track.getDataValue("hookTimings");
      const jsonVal = track.toJSON();
      console.log(`[DEBUG findAllTracksByIds] Track ${idx} (${track.trackCode}): rawHookTimings=`, rawVal, `toJSON.hookTimings=`, (jsonVal as any).hookTimings);
    });
  }

  return rows.map((track) => track.toJSON() as RawTrackWithMappings);
};

export const findTracksByIds = async (
  ids: string[],
  page: number,
  limit: number,
): Promise<PaginatedRawTracks> => {
  const offset = (page - 1) * limit;

  const { count, rows } = await TrackModel.findAndCountAll({
    where: { id: { [Op.in]: ids }, status: "ACTIVE" },
    order: [["createdAt", "DESC"]],
    limit,
    offset,
    distinct: true,
    col: "id",
    include: [...getArtistInclude(), ...getStandardSkuInclude(), ...getActiveCampaignInclude()],
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
  excludeOwnerIds?: string[];
  excludeTiers?: string[];
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
  excludeOwnerIds?: string[],
  excludeTiers?: string[],
): Promise<RawTrackWithMappings | null> => {

  const conditions: any[] = [];

  const excludeOwners = Array.isArray(excludeOwnerIds) ? excludeOwnerIds : [];
  const tiersToExclude = Array.isArray(excludeTiers) ? excludeTiers : [];

  if (excludeOwners.length) {
    conditions.push({
      [Op.not]: {
        ownerId: {
          [Op.overlap]: excludeOwners
        }
      }
    });
  }

  if (tiersToExclude.length) {
    conditions.push({
      [Op.or]: [
        { tier: { [Op.notIn]: tiersToExclude } },
        { tier: null }
      ]
    });
  }

  const whereClause: any = {
    trackCode,
    status: "ACTIVE"
  };

  if (conditions.length) {
    whereClause[Op.and] = conditions;
  }

  const track = await TrackModel.findOne({
    where: whereClause,
    include: [
      ...getArtistInclude(),
      ...getAllSkusInclude(),
      ...getFilterMappingsInclude(),
      ...getActiveCampaignInclude(),
    ],
  });

  // Debug: Log hookTimings data for track detail
  if (track) {
    const rawVal = track.getDataValue("hookTimings");
    const jsonVal = track.toJSON();
    console.log(`[DEBUG findTrackByTrackCode] Track ${track.trackCode}: rawHookTimings=`, rawVal, `toJSON.hookTimings=`, (jsonVal as any).hookTimings);
  }

  return track ? (track.toJSON() as RawTrackWithMappings) : null;
};

export const findTracksByFilter = async (
  params: GetTracksByFilterParams,
): Promise<PaginatedRawFilterTracks> => {

  const { filterIds, page, limit, ownerIds, excludeOwnerIds, excludeTiers } = params;
  const offset = (page - 1) * limit;

  const conditions: any[] = [];

  const includeOwners = Array.isArray(ownerIds) ? ownerIds : [];
  const excludeOwners = Array.isArray(excludeOwnerIds) ? excludeOwnerIds : [];
  const tiersToExclude = Array.isArray(excludeTiers) ? excludeTiers : [];

  if (includeOwners.length) {
    conditions.push({
      ownerId: {
        [Op.overlap]: includeOwners
      }
    });
  }

  if (excludeOwners.length) {
    conditions.push({
      [Op.not]: {
        ownerId: {
          [Op.overlap]: excludeOwners
        }
      }
    });
  }

  if (tiersToExclude.length) {
    conditions.push({
      [Op.or]: [
        { tier: { [Op.notIn]: tiersToExclude } },
        { tier: null }
      ]
    });
  }

  const trackWhere: any = {
    status: "ACTIVE"
  };

  if (conditions.length) {
    trackWhere[Op.and] = conditions;
  }

  const now = new Date();
  const { count, rows: mappings } =
    await TrackFilterMappingModel.findAndCountAll({
      where: {
        filterId: { [Op.in]: filterIds }
      },
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
            {
              model: CampaignModel,
              as: "campaign",
              required: false,
              attributes: ["amount", "amountType", "currentUsage", "totalUsage", "validFrom", "validTill"],
              where: {
                status: CampaignStatus.ACTIVE,
                validFrom: { [Op.lte]: now },
                validTill: { [Op.gte]: now },
              },
            },
          ],
        },
      ],
    });

  // Debug: Log hookTimings for first few tracks in filter query
  if (mappings.length > 0) {
    mappings.slice(0, 3).forEach((mapping, idx) => {
      if (mapping.track) {
        const rawVal = mapping.track.getDataValue("hookTimings");
        const jsonVal = mapping.track.toJSON();
        console.log(`[DEBUG findTracksByFilter] Track ${idx} (${mapping.track.trackCode}): rawHookTimings=`, rawVal, `toJSON.hookTimings=`, (jsonVal as any).hookTimings);
      }
    });
  }

  return {
    rows: mappings.map((mapping) => ({
      trackId: mapping.trackId,
      track: mapping.track
        ? (mapping.track.toJSON() as RawTrackWithMappings)
        : null,
    })),
    count,
    page,
    limit,
  };
};

// Get all campaign IDs used by a user from sound_projects
export const getUserUsedCampaignIds = async (
  userId: number,
): Promise<Set<string>> => {
  const projects = await SoundProjectModel.findAll({
    where: { userId },
    attributes: ["campaignId"],
  });

  const usedCampaignIds = new Set<string>();
  for (const project of projects) {
    if (project.campaignId) {
      usedCampaignIds.add(String(project.campaignId));
    }
  }

  return usedCampaignIds;
};
