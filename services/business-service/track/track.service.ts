import {
  PaginatedTracksResponseData,
  TrackWithArtists,
  TrackDetailsWithSkus,
  SkuInfo,
  ArtistInfoTrack,
  RawTrackWithMappings,
  PaginatedRawTracks,
  GetAllTracksRequestData,
  GetTracksByCodesQuery,
  FilterInfo,
  Platform,
  UNAUTHENTICATED_RESTRICTED_OWNER_NAMES,
  TOKEN_GATED_TRACK_CODES,
} from "../../dto-service/modules.export";
import {
  findAllTracks,
  findTracksByTrackCodes,
  findTracksByFilter,
  findTrackByTrackCode,
  findAlbumByTrackId,
  findTrackIdsByAlbumType,
  getRestrictedOwnersByBrandId,
  getRestrictedTrackTiersByBrandId,
  getUserUsedCampaignIds,
  getOwnerIdsByNames,
  searchTracksByName,
  getActiveBrandTokenTypes,
  type PaginatedRawFilterTracks,
  type TrackSearchResult,
} from "../../persistence-service/exports";
import { getUserLikedTrackCodes } from "../../persistence-service/user/liked-track.persistence.service";
import { toCdnUrl } from "../../helper-service/cdn.helper";
import { OwnerModel } from "../../persistence-service/owner/modules.export";
import { Op, fn, col, where } from "sequelize";

// Parse and validate pagination params
const parsePaginationParams = (
  pageStr?: string,
  limitStr?: string,
): { page: number; limit: number } => {
  const page = parseInt(pageStr || "1", 10);
  const limit = parseInt(limitStr || "10", 10);
  return {
    page: page > 0 ? page : 1,
    limit: limit > 0 && limit <= 100 ? limit : 10,
  };
};

// Filter type constants
const FILTER_TYPES = {
  LANGUAGE: "language",
  GENRE: "genre",
  CATEGORY: "usecase",
  OCCASION: "occasion",
} as const;

// Extract filters by type from track filter mappings
const extractFiltersByType = (
  track: RawTrackWithMappings,
  filterType: string,
): FilterInfo[] => {
  if (!track.trackFilterMappings) {
    return [];
  }

  return track.trackFilterMappings
    .filter((mapping) => mapping.filter?.type?.toLowerCase() === filterType)
    .map((mapping) => ({
      id: mapping.filter!.id,
      name: mapping.filter!.name,
      slug: mapping.filter!.name_slug ?? null,
    }));
};

// Normalize hookTimings which may be a JSON string, array, or object.
// Always returns a value so the field is present in every track response.
// Returns [] when no hook timings exist.
const normalizeHookTimings = (raw: unknown): unknown => {
  if (raw === null || raw === undefined) return [];
  let value: unknown = raw;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return [];
    }
  }
  if (Array.isArray(value)) return value.length > 0 ? value : [];
  if (typeof value === "object") {
    // If it's an empty object {}, return empty array
    if (Object.keys(value as object).length === 0) return [];
    return value;
  }
  return [];
};

const getStandardToken = (_track: RawTrackWithMappings): number => {
  return 1;
};

// Fetch owner maps from a list of tracks
const fetchOwnerMaps = async (
  tracks: RawTrackWithMappings[],
): Promise<{
  ownerTypeMap: Map<string, string>;
  ownerSubTypeMap: Map<string, string>;
  ownerUsageInfoMap: Map<string, object>;
  ownerRestrictedCategoriesMap: Map<string, object>;
  ownerCodeMap: Map<string, string>;
  ownerUsernameMap: Map<string, string>;
}> => {
  const allOwnerIds: string[] = [];
  tracks.forEach((track) => {
    if (track.ownerId && Array.isArray(track.ownerId)) {
      allOwnerIds.push(...track.ownerId);
    }
  });

  const uniqueOwnerIds = [...new Set(allOwnerIds)];
  const ownerTypeMap = new Map<string, string>();
  const ownerSubTypeMap = new Map<string, string>();
  const ownerUsageInfoMap = new Map<string, object>();
  const ownerRestrictedCategoriesMap = new Map<string, object>();
  const ownerCodeMap = new Map<string, string>();
  const ownerUsernameMap = new Map<string, string>();

  if (uniqueOwnerIds.length > 0) {
    const owners = await OwnerModel.findAll({
      where: { id: { [Op.in]: uniqueOwnerIds } },
      attributes: [
        "id",
        "type",
        "subType",
        "usageInfo",
        "restrictedCategories",
        "ownerCode",
        "username",
      ],
    });
    owners.forEach((owner) => {
      if (owner.type) ownerTypeMap.set(owner.id, owner.type);
      if (owner.subType) ownerSubTypeMap.set(owner.id, owner.subType);
      if (owner.usageInfo) ownerUsageInfoMap.set(owner.id, owner.usageInfo);
      if (owner.restrictedCategories)
        ownerRestrictedCategoriesMap.set(owner.id, owner.restrictedCategories);
      if (owner.ownerCode) ownerCodeMap.set(owner.id, owner.ownerCode);
      if (owner.username) ownerUsernameMap.set(owner.id, owner.username);
    });
  }

  return {
    ownerTypeMap,
    ownerSubTypeMap,
    ownerUsageInfoMap,
    ownerRestrictedCategoriesMap,
    ownerCodeMap,
    ownerUsernameMap,
  };
};

// Fetch albums for tracks
const fetchAlbumsForTracks = async (
  tracks: RawTrackWithMappings[],
): Promise<Map<string, { id: string; title?: string; type?: string }>> => {
  const albumMap = new Map<
    string,
    { id: string; title?: string; type?: string }
  >();

  for (const track of tracks) {
    const album = await findAlbumByTrackId(track.id);
    if (album) {
      albumMap.set(track.id, {
        id: album.id,
        title: album.title,
        type: album.type as string | undefined,
      });
    }
  }

  return albumMap;
};

// Transform raw track data to TrackWithArtists DTO
const transformTrackToDto = (
  track: RawTrackWithMappings,
  likedTrackCodes?: Set<string>,
  ownerTypeMap?: Map<string, string>,
  ownerSubTypeMap?: Map<string, string>,
  ownerCodeMap?: Map<string, string>,
  usedCampaignIds?: Set<string>,
  activeTokenTypes?: Set<string>,
): TrackWithArtists => {
  // Debug: Log hookTimings data to trace the issue
  console.log(`[DEBUG hookTimings] trackCode=${track.trackCode}, raw hookTimings:`, JSON.stringify(track.hookTimings), `type:`, typeof track.hookTimings, `isArray:`, Array.isArray(track.hookTimings));
  const primaryArtists: ArtistInfoTrack[] = [];

  if (track.trackArtistMappings) {
    for (const mapping of track.trackArtistMappings) {
      if (mapping.artist && mapping.isPrimary) {
        primaryArtists.push({
          id: mapping.artist.id,
          name: mapping.artist.name,
          type: mapping.artist.type || [],
        });
      }
    }
  }

  // Get ownerType, ownerSubType, ownerCode from the first matching owner
  let ownerType: string | null = null;
  let ownerSubType: string | null = null;
  let ownerCode: string | null = null;
  if (track.ownerId && Array.isArray(track.ownerId) && ownerTypeMap) {
    for (const oid of track.ownerId) {
      if (!ownerType && ownerTypeMap.get(oid))
        ownerType = ownerTypeMap.get(oid) || null;
      if (!ownerSubType && ownerSubTypeMap?.get(oid))
        ownerSubType = ownerSubTypeMap.get(oid) || null;
      if (!ownerCode && ownerCodeMap?.get(oid))
        ownerCode = ownerCodeMap.get(oid) || null;
      if (ownerType && ownerSubType && ownerCode) break;
    }
  }

  const isEnterpriseOnly = ownerType === "Chartbusters" && !(activeTokenTypes?.has("Chartbusters") ?? false);
  const hasTokenForTrack = ownerType ? (activeTokenTypes?.has(ownerType) ?? false) : false;
  const isTokenGatedTrack = TOKEN_GATED_TRACK_CODES.has(track.trackCode);
  const hidePrice = isTokenGatedTrack ? !hasTokenForTrack : (isEnterpriseOnly || hasTokenForTrack);

  let sku: SkuInfo | undefined;
  if (track.skus && track.skus.length > 0) {
    const skuData = track.skus[0];
    sku = {
      id: skuData.id || "",
      costPrice: hidePrice ? undefined : skuData.costPrice,
      sellingPrice: hidePrice ? undefined : skuData.sellingPrice,
    };
  }

  const dto: TrackWithArtists = {
    id: track.id,
    trackCode: track.trackCode,
    name: track.name || "",
    name_slug: track.name_slug || "",
    waveformLink: toCdnUrl(track.waveformLink),
    mp3Link: toCdnUrl(track.mp3Link),
    hasVocals: track.hasVocals,
    trending: track.trending,
    primaryArtists,
    ...(hasTokenForTrack && { token: getStandardToken(track) }),
    isLiked: likedTrackCodes ? likedTrackCodes.has(track.trackCode) : false,
    ...(ownerType !== null && { ownerType: ownerType ?? undefined }),
    ...(ownerSubType !== null && { ownerSubType: ownerSubType ?? undefined }),
    ...(ownerCode !== null && { ownerCode: ownerCode ?? undefined }),
    ...(isEnterpriseOnly && { isEnterpriseOnly: true }),
    ...(sku && { sku }),
    ...(track.album && { album: track.album }),
    hookTimings: normalizeHookTimings(track.hookTimings),
    // Only include campaign if it exists and hasn't been used by the user
    ...(track.campaign &&
      !(
        usedCampaignIds &&
        track.campaignId &&
        usedCampaignIds.has(String(track.campaignId))
      ) && {
        campaign: {
          amount: track.campaign.amount,
          type: track.campaign.amountType,
          currentUsage: track.campaign.currentUsage,
          totalUsage: track.campaign.totalUsage,
          validFrom: track.campaign.validFrom,
          validTill: track.campaign.validTill,
        },
      }),
  };

  return dto;
};

// Build paginated response from raw data
const buildPaginatedResponse = (
  rawData: PaginatedRawTracks,
  likedTrackCodes?: Set<string>,
  ownerTypeMap?: Map<string, string>,
  ownerSubTypeMap?: Map<string, string>,
  ownerCodeMap?: Map<string, string>,
  albumMap?: Map<string, { id: string; title?: string; type?: string }>,
  usedCampaignIds?: Set<string>,
  activeTokenTypes?: Set<string>,
): PaginatedTracksResponseData => {
  const { rows, count, page, limit } = rawData;
  const totalPages = Math.ceil(count / limit);

  return {
    tracks: rows.map((track) => {
      // Add album data to track if it exists
      if (albumMap && albumMap.has(track.id)) {
        track.album = albumMap.get(track.id);
      }
      return transformTrackToDto(
        track,
        likedTrackCodes,
        ownerTypeMap,
        ownerSubTypeMap,
        ownerCodeMap,
        usedCampaignIds,
        activeTokenTypes,
      );
    }),
    pagination: {
      page,
      limit,
      totalItems: count,
      totalPages,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
    },
  };
};

// Resolve type filter to matching owner IDs
const resolveOwnerIdsByType = async (
  types?: string[],
): Promise<string[] | undefined> => {
  if (!types || types.length === 0) return undefined;
  const filteredTypes = types.filter((t) => t.trim() !== "");
  if (filteredTypes.length === 0) return undefined;
  types = filteredTypes;

  const normalize = (str: string) =>
    str
      .trim()
      .replace(/[\s_]+/g, "")
      .toLowerCase();
  const normalizedTypes = new Set(types.map(normalize));
  const allOwners = await OwnerModel.findAll({
    where: { type: { [Op.ne]: null } } as any,
    attributes: ["id", "type"],
  });
  const matchedOwners = allOwners.filter((o) =>
    normalizedTypes.has(normalize(o.type!)),
  );
  const ownerIds = matchedOwners.map((o) => o.id);
  return ownerIds.length > 0 ? ownerIds : [];
};

// Resolve ownerCode filter to matching owner IDs (case-insensitive)
const resolveOwnerIdsByOwnerCode = async (
  ownerCodes?: string[],
): Promise<string[] | undefined> => {
  if (!ownerCodes || ownerCodes.length === 0) return undefined;
  const filteredCodes = ownerCodes.map((c) => c.trim()).filter((c) => c !== "");
  if (filteredCodes.length === 0) return undefined;

  const lowerCodes = filteredCodes.map((c) => c.toLowerCase());
  const owners = await OwnerModel.findAll({
    where: where(fn("LOWER", col("ownerCode")), { [Op.in]: lowerCodes }) as any,
    attributes: ["id"],
  });
  const ownerIds = owners.map((o) => o.id);
  return ownerIds.length > 0 ? ownerIds : [];
};

// Resolve subType filter to matching owner IDs (case-insensitive)
const resolveOwnerIdsBySubType = async (
  subTypes?: string[],
): Promise<string[] | undefined> => {
  if (!subTypes || subTypes.length === 0) return undefined;
  const filtered = subTypes.map((s) => s.trim()).filter((s) => s !== "");
  if (filtered.length === 0) return undefined;

  const lowerSubTypes = filtered.map((s) => s.toLowerCase());
  const owners = await OwnerModel.findAll({
    where: where(fn("LOWER", col("subType")), { [Op.in]: lowerSubTypes }) as any,
    attributes: ["id"],
  });
  const ownerIds = owners.map((o) => o.id);
  return ownerIds.length > 0 ? ownerIds : [];
};

// Intersect two owner ID arrays (both filters must match)
const intersectOwnerIds = (
  a: string[] | undefined,
  b: string[] | undefined,
): string[] | undefined => {
  if (!a && !b) return undefined;
  if (!a) return b;
  if (!b) return a;
  const setB = new Set(b);
  return a.filter((id) => setB.has(id));
};

// Empty pagination response helper
const emptyPaginatedResponse = (
  page: number,
  limit: number,
): PaginatedTracksResponseData => ({
  tracks: [],
  pagination: {
    page,
    limit,
    totalItems: 0,
    totalPages: 0,
    hasNextPage: false,
    hasPrevPage: false,
  },
});

// Reusable helper: transform a flat array of raw tracks into TrackWithArtists[]
export const transformRawTracksToDto = async (
  tracks: RawTrackWithMappings[],
  likedTrackCodes?: Set<string>,
  activeTokenTypes?: Set<string>,
): Promise<TrackWithArtists[]> => {
  if (tracks.length === 0) return [];
  const { ownerTypeMap, ownerSubTypeMap, ownerCodeMap } =
    await fetchOwnerMaps(tracks);
  const albumMap = await fetchAlbumsForTracks(tracks);
  return tracks.map((track) => {
    if (albumMap.has(track.id)) {
      track.album = albumMap.get(track.id);
    }
    return transformTrackToDto(
      track,
      likedTrackCodes,
      ownerTypeMap,
      ownerSubTypeMap,
      ownerCodeMap,
      undefined,
      activeTokenTypes,
    );
  });
};

// Reusable helper: transform raw paginated tracks into the response DTO
export const buildTracksResponseFromRawData = async (
  rawData: PaginatedRawTracks,
  likedTrackCodes?: Set<string>,
): Promise<PaginatedTracksResponseData> => {
  const { ownerTypeMap, ownerSubTypeMap, ownerCodeMap } = await fetchOwnerMaps(
    rawData.rows,
  );
  const albumMap = await fetchAlbumsForTracks(rawData.rows);
  return buildPaginatedResponse(
    rawData,
    likedTrackCodes,
    ownerTypeMap,
    ownerSubTypeMap,
    ownerCodeMap,
    albumMap,
  );
};

export const getAllTracksService = async (
  query: GetAllTracksRequestData,
  userId?: number,
  brandId?: number,
  platform?: Platform,
): Promise<PaginatedTracksResponseData> => {
  const { page, limit } = parsePaginationParams(query.page, query.limit);

  const whereClause: Record<string, unknown> = {};
  if (query.trending === true) {
    whereClause.trending = true;
  }
  if (query.popular === true) {
    // Filter tracks with jioSaavanStream > 0 or null, sorting handled in persistence layer
    whereClause[Op.or as any] = [
      { jioSaavanStream: { [Op.gt]: "0" } },
      { jioSaavanStream: null },
    ];

    // Filter by album type based on movie parameter
    const movieTrackIds = await findTrackIdsByAlbumType("movie");
    if (query.movie === true) {
      // Include only tracks from "movie" albums
      if (movieTrackIds.length === 0) {
        return emptyPaginatedResponse(page, limit);
      }
      whereClause.id = { [Op.in]: movieTrackIds };
    } else if (query.movie === false) {
      // Exclude tracks from "movie" albums
      if (movieTrackIds.length > 0) {
        whereClause.id = { [Op.notIn]: movieTrackIds };
      }
    }
  }

  if (query.newOnHoopr === true) {
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    whereClause.createdAt = { [Op.gte]: oneWeekAgo };
  }

  if (query.releaseYearFrom || query.releaseYearTo) {
    const releaseDateCondition: any = {};
    if (query.releaseYearFrom) {
      releaseDateCondition[Op.gte] = new Date(`${query.releaseYearFrom}-01-01`);
    }
    if (query.releaseYearTo) {
      releaseDateCondition[Op.lt] = new Date(
        `${query.releaseYearTo + 1}-01-01`,
      );
    }
    whereClause.releaseDate = releaseDateCondition;
  }

  // Resolve owner IDs from type, ownerCode, and subType filters, then intersect
  const [ownerIdsByType, ownerIdsByCode, ownerIdsBySubType] = await Promise.all([
    resolveOwnerIdsByType(query.type),
    resolveOwnerIdsByOwnerCode(query.ownerCode),
    resolveOwnerIdsBySubType(query.subType),
  ]);
  const ownerIds = intersectOwnerIds(
    intersectOwnerIds(ownerIdsByType, ownerIdsByCode),
    ownerIdsBySubType,
  );
  if (ownerIds && ownerIds.length === 0) {
    return emptyPaginatedResponse(page, limit);
  }

  // Get restricted owners and tiers for the brand, or use default blacklist for unauthenticated users
  let excludeOwnerIds: string[] | undefined;
  let excludeTiers: string[] | undefined;
  let activeTokenTypes = new Set<string>();
  if (brandId) {
    const [brandExcludeOwnerIds, brandExcludeTiers, tokenTypes, defaultRestrictedIds] = await Promise.all([
      getRestrictedOwnersByBrandId(brandId),
      getRestrictedTrackTiersByBrandId(brandId),
      getActiveBrandTokenTypes(brandId),
      UNAUTHENTICATED_RESTRICTED_OWNER_NAMES.length > 0
        ? getOwnerIdsByNames(UNAUTHENTICATED_RESTRICTED_OWNER_NAMES)
        : Promise.resolve([]),
    ]);
    activeTokenTypes = tokenTypes;
    excludeTiers = brandExcludeTiers;
    const defaultRestricted = tokenTypes.has("Chartbusters") ? [] : defaultRestrictedIds;
    const combined = [...(brandExcludeOwnerIds || []), ...defaultRestricted];
    excludeOwnerIds = combined.length > 0 ? combined : undefined;
  } else if (UNAUTHENTICATED_RESTRICTED_OWNER_NAMES.length > 0) {
    const resolvedIds = await getOwnerIdsByNames(
      UNAUTHENTICATED_RESTRICTED_OWNER_NAMES,
    );
    excludeOwnerIds = resolvedIds.length > 0 ? resolvedIds : undefined;
  }

  // Fetch user's liked track codes if authenticated
  let likedTrackCodes: Set<string> | undefined;
  if (userId) {
    const likedCodes = await getUserLikedTrackCodes(userId);
    likedTrackCodes = new Set(likedCodes);
  }

  // Campaign data should only be fetched if:
  // 1. User is NOT logged in (no token), OR
  // 2. User IS logged in AND platform is SOUND_TRACKING_APP
  const shouldFetchCampaign = query.campaign === true;

  // Fetch user's used campaign IDs to filter them out from display
  let usedCampaignIds: Set<string> | undefined;
  if (shouldFetchCampaign && userId) {
    usedCampaignIds = await getUserUsedCampaignIds(userId);
  }

  const rawData = await findAllTracks(
    page,
    limit,
    whereClause,
    ownerIds,
    excludeOwnerIds,
    query.popular === true,
    shouldFetchCampaign,
    excludeTiers,
  );
  const { ownerTypeMap, ownerSubTypeMap, ownerCodeMap } = await fetchOwnerMaps(
    rawData.rows,
  );
  const albumMap = await fetchAlbumsForTracks(rawData.rows);
  const response = buildPaginatedResponse(
    rawData,
    likedTrackCodes,
    ownerTypeMap,
    ownerSubTypeMap,
    ownerCodeMap,
    albumMap,
    usedCampaignIds,
    activeTokenTypes,
  );

  return response;
};

// Build paginated response from raw paginated track data
// export const buildTracksResponseFromRawData = async (
//   rawData: PaginatedRawTracks,
//   likedTrackCodes?: Set<string>,
// ): Promise<PaginatedTracksResponseData> => {
//   const { ownerTypeMap, ownerSubTypeMap, ownerCodeMap } = await fetchOwnerMaps(rawData.rows);
//   return buildPaginatedResponse(rawData, likedTrackCodes, ownerTypeMap, ownerSubTypeMap, ownerCodeMap);
// };

// Sort tracks in the same order as the requested trackCodes
const sortTracksByRequestedOrder = (
  tracks: RawTrackWithMappings[],
  trackCodes: string[],
): RawTrackWithMappings[] => {
  return trackCodes
    .map((code) => tracks.find((track) => track.trackCode === code))
    .filter((track): track is RawTrackWithMappings => track !== undefined);
};

export const getTracksByCodesService = async (
  query: GetTracksByCodesQuery,
  userId?: number,
  brandId?: number,
): Promise<PaginatedTracksResponseData> => {
  const { page, limit } = parsePaginationParams(query.page, query.limit);

  if (
    !query.trackCodes ||
    !Array.isArray(query.trackCodes) ||
    query.trackCodes.length === 0
  ) {
    return emptyPaginatedResponse(page, limit);
  }

  // If type filter is provided, find matching owner IDs
  const ownerIds = await resolveOwnerIdsByType(query.type);
  if (ownerIds && ownerIds.length === 0) {
    return emptyPaginatedResponse(page, limit);
  }

  // Get restricted owners and tiers for the brand, or use default blacklist for unauthenticated users
  let excludeOwnerIds: string[] | undefined;
  let excludeTiers: string[] | undefined;
  let activeTokenTypes = new Set<string>();
  if (brandId) {
    const [brandExcludeOwnerIds, brandExcludeTiers, tokenTypes, defaultRestrictedIds] = await Promise.all([
      getRestrictedOwnersByBrandId(brandId),
      getRestrictedTrackTiersByBrandId(brandId),
      getActiveBrandTokenTypes(brandId),
      UNAUTHENTICATED_RESTRICTED_OWNER_NAMES.length > 0
        ? getOwnerIdsByNames(UNAUTHENTICATED_RESTRICTED_OWNER_NAMES)
        : Promise.resolve([]),
    ]);
    activeTokenTypes = tokenTypes;
    excludeTiers = brandExcludeTiers;
    const defaultRestricted = tokenTypes.has("Chartbusters") ? [] : defaultRestrictedIds;
    const combined = [...(brandExcludeOwnerIds || []), ...defaultRestricted];
    excludeOwnerIds = combined.length > 0 ? combined : undefined;
  } else if (UNAUTHENTICATED_RESTRICTED_OWNER_NAMES.length > 0) {
    const resolvedIds = await getOwnerIdsByNames(
      UNAUTHENTICATED_RESTRICTED_OWNER_NAMES,
    );
    excludeOwnerIds = resolvedIds.length > 0 ? resolvedIds : undefined;
  }

  // Fetch user's liked track codes if authenticated
  let likedTrackCodes: Set<string> | undefined;
  if (userId) {
    const likedCodes = await getUserLikedTrackCodes(userId);
    likedTrackCodes = new Set(likedCodes);
  }

  const rawData = await findTracksByTrackCodes(
    query.trackCodes,
    page,
    limit,
    ownerIds,
    excludeOwnerIds,
    excludeTiers,
  );

  // Sort tracks in the order of requested trackCodes
  const orderedTracks = sortTracksByRequestedOrder(
    rawData.rows,
    query.trackCodes,
  );

  const { ownerTypeMap, ownerSubTypeMap, ownerCodeMap } =
    await fetchOwnerMaps(orderedTracks);
  const albumMap = await fetchAlbumsForTracks(orderedTracks);
  return buildPaginatedResponse(
    {
      ...rawData,
      rows: orderedTracks,
    },
    likedTrackCodes,
    ownerTypeMap,
    ownerSubTypeMap,
    ownerCodeMap,
    albumMap,
    undefined,
    activeTokenTypes,
  );
};

export interface GetTracksByFilterQuery {
  filterName: string;
  filterIds: string[];
  page?: string;
  limit?: string;
  type?: string[];
}

// Transform raw filter mapping data to paginated response
const buildFilterPaginatedResponse = (
  rawData: PaginatedRawFilterTracks,
  likedTrackCodes?: Set<string>,
  ownerTypeMap?: Map<string, string>,
  ownerSubTypeMap?: Map<string, string>,
  ownerCodeMap?: Map<string, string>,
  albumMap?: Map<string, { id: string; title?: string; type?: string }>,
  activeTokenTypes?: Set<string>,
): PaginatedTracksResponseData => {
  const { rows, count, page, limit } = rawData;
  const totalPages = Math.ceil(count / limit);

  const tracks: TrackWithArtists[] = rows
    .filter((mapping) => {
      if (!mapping.track) {
        console.log(
          `Warning: Skipped track with ID: ${mapping.trackId ?? "unknown"} - not found in tracks table`,
        );
        return false;
      }
      return true;
    })
    .map((mapping) => {
      // Add album data to track if it exists
      if (albumMap && albumMap.has(mapping.track!.id)) {
        mapping.track!.album = albumMap.get(mapping.track!.id);
      }
      return transformTrackToDto(
        mapping.track!,
        likedTrackCodes,
        ownerTypeMap,
        ownerSubTypeMap,
        ownerCodeMap,
        undefined,
        activeTokenTypes,
      );
    });

  return {
    tracks,
    pagination: {
      page,
      limit,
      totalItems: count,
      totalPages,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
    },
  };
};

export const getTracksByFilterService = async (
  query: GetTracksByFilterQuery,
  userId?: number,
  brandId?: number,
): Promise<PaginatedTracksResponseData> => {
  const { page, limit } = parsePaginationParams(query.page, query.limit);

  // If type filter is provided, find matching owner IDs
  const ownerIds = await resolveOwnerIdsByType(query.type);
  if (ownerIds && ownerIds.length === 0) {
    return emptyPaginatedResponse(page, limit);
  }

  // Get restricted owners and tiers for the brand, or use default blacklist for unauthenticated users
  let excludeOwnerIds: string[] | undefined;
  let excludeTiers: string[] | undefined;
  let activeTokenTypes = new Set<string>();
  if (brandId) {
    const [brandExcludeOwnerIds, brandExcludeTiers, tokenTypes, defaultRestrictedIds] = await Promise.all([
      getRestrictedOwnersByBrandId(brandId),
      getRestrictedTrackTiersByBrandId(brandId),
      getActiveBrandTokenTypes(brandId),
      UNAUTHENTICATED_RESTRICTED_OWNER_NAMES.length > 0
        ? getOwnerIdsByNames(UNAUTHENTICATED_RESTRICTED_OWNER_NAMES)
        : Promise.resolve([]),
    ]);
    activeTokenTypes = tokenTypes;
    excludeTiers = brandExcludeTiers;
    const defaultRestricted = tokenTypes.has("Chartbusters") ? [] : defaultRestrictedIds;
    const combined = [...(brandExcludeOwnerIds || []), ...defaultRestricted];
    excludeOwnerIds = combined.length > 0 ? combined : undefined;
  } else if (UNAUTHENTICATED_RESTRICTED_OWNER_NAMES.length > 0) {
    const resolvedIds = await getOwnerIdsByNames(
      UNAUTHENTICATED_RESTRICTED_OWNER_NAMES,
    );
    excludeOwnerIds = resolvedIds.length > 0 ? resolvedIds : undefined;
  }

  // Fetch user's liked track codes if authenticated
  let likedTrackCodes: Set<string> | undefined;
  if (userId) {
    const likedCodes = await getUserLikedTrackCodes(userId);
    likedTrackCodes = new Set(likedCodes);
  }

  const rawData = await findTracksByFilter({
    filterIds: query.filterIds,
    page,
    limit,
    ownerIds,
    excludeOwnerIds,
    excludeTiers,
  });

  const filterTracks = rawData.rows.filter((m) => m.track).map((m) => m.track!);
  const { ownerTypeMap, ownerSubTypeMap, ownerCodeMap } =
    await fetchOwnerMaps(filterTracks);
  const albumMap = await fetchAlbumsForTracks(filterTracks);
  return buildFilterPaginatedResponse(
    rawData,
    likedTrackCodes,
    ownerTypeMap,
    ownerSubTypeMap,
    ownerCodeMap,
    albumMap,
    activeTokenTypes,
  );
};

// Transform raw track data to TrackDetailsWithSkus DTO (includes both SKUs and filters)
const transformTrackToDetailsDto = (
  track: RawTrackWithMappings,
  likedTrackCodes?: Set<string>,
  ownerTypeMap?: Map<string, string>,
  ownerSubTypeMap?: Map<string, string>,
  ownerUsageInfoMap?: Map<string, object>,
  ownerRestrictedCategoriesMap?: Map<string, object>,
  ownerCodeMap?: Map<string, string>,
  ownerUsernameMap?: Map<string, string>,
  albumName?: string,
  activeTokenTypes?: Set<string>,
): TrackDetailsWithSkus => {
  const baseDto = transformTrackToDto(
    track,
    likedTrackCodes,
    ownerTypeMap,
    ownerSubTypeMap,
    undefined,
    undefined,
    activeTokenTypes,
  );

  // Pick usageInfo, restrictedCategories, ownerCode and ownerName from the first owner that has them
  let usageInfo: object | undefined;
  let restrictedCategories: object | undefined;
  let ownerCode: string | undefined;
  let ownerName: string | undefined;
  if (track.ownerId && Array.isArray(track.ownerId)) {
    for (const oid of track.ownerId) {
      if (!usageInfo && ownerUsageInfoMap?.get(oid))
        usageInfo = ownerUsageInfoMap.get(oid);
      if (!restrictedCategories && ownerRestrictedCategoriesMap?.get(oid))
        restrictedCategories = ownerRestrictedCategoriesMap.get(oid);
      if (!ownerCode && ownerCodeMap?.get(oid))
        ownerCode = ownerCodeMap.get(oid);
      if (!ownerName && ownerUsernameMap?.get(oid))
        ownerName = ownerUsernameMap.get(oid);
      if (usageInfo && restrictedCategories && ownerCode && ownerName) break;
    }
  }

  // Build songCredits string
  const allArtistNames = (track.trackArtistMappings || [])
    .map((m) => m.artist?.name)
    .filter((n): n is string => !!n);
  const releaseYear = track.releaseDate
    ? new Date(track.releaseDate).getFullYear()
    : null;
  const creditParts: string[] = [];
  if (allArtistNames.length > 0)
    creditParts.push([...new Set(allArtistNames)].join(", "));
  if (releaseYear) creditParts.push(String(releaseYear));
  if (ownerName) creditParts.push(ownerName);
  const songCredits =
    albumName && albumName.trim() !== ""
      ? `From '${albumName}' by ${creditParts.join(" | ")}`
      : `'${track.name}' by ${creditParts.join(" | ")}`;

  let sku: SkuInfo | undefined;

  if (track.skus && track.skus.length > 0) {
    const skuData = track.skus[0];
    const isEnterpriseOnly = baseDto.isEnterpriseOnly === true;
    const hasTokenForTrack = baseDto.ownerType ? (activeTokenTypes?.has(baseDto.ownerType) ?? false) : false;
    const isTokenGatedTrack = TOKEN_GATED_TRACK_CODES.has(track.trackCode);
    const hidePrice = isTokenGatedTrack ? !hasTokenForTrack : (isEnterpriseOnly || hasTokenForTrack);
    sku = {
      id: skuData.id || "",
      costPrice: hidePrice ? undefined : skuData.costPrice,
      sellingPrice: hidePrice ? undefined : skuData.sellingPrice,
      gstPercent: skuData.gstPercent,
      maxUsage: skuData.maxUsage,
      description: skuData.description,
    };
  }

  // Extract filters by type
  const languages = extractFiltersByType(track, FILTER_TYPES.LANGUAGE);
  const genres = extractFiltersByType(track, FILTER_TYPES.GENRE);
  const categories = extractFiltersByType(track, FILTER_TYPES.CATEGORY);
  const occasions = extractFiltersByType(track, FILTER_TYPES.OCCASION);

  return {
    ...baseDto,
    sku,
    languages,
    genres,
    categories,
    occasions,
    description: track.description ?? null,
    ...(usageInfo && { usageInfo }),
    ...(restrictedCategories && { restrictedCategories }),
    ...(ownerCode && { ownerCode }),
    ...(songCredits && { songCredits }),
  };
};

export const getTrackDetailsByCodeService = async (
  trackCode: string,
  userId?: number,
  brandId?: number,
): Promise<TrackDetailsWithSkus | null> => {
  // Get restricted owners and tiers for the brand, or use default blacklist for unauthenticated users
  let excludeOwnerIds: string[] | undefined;
  let excludeTiers: string[] | undefined;
  let activeTokenTypes = new Set<string>();
  if (brandId) {
    const [brandExcludeOwnerIds, brandExcludeTiers, tokenTypes, defaultRestrictedIds] = await Promise.all([
      getRestrictedOwnersByBrandId(brandId),
      getRestrictedTrackTiersByBrandId(brandId),
      getActiveBrandTokenTypes(brandId),
      UNAUTHENTICATED_RESTRICTED_OWNER_NAMES.length > 0
        ? getOwnerIdsByNames(UNAUTHENTICATED_RESTRICTED_OWNER_NAMES)
        : Promise.resolve([]),
    ]);
    activeTokenTypes = tokenTypes;
    excludeTiers = brandExcludeTiers;
    const defaultRestricted = tokenTypes.has("Chartbusters") ? [] : defaultRestrictedIds;
    const combined = [...(brandExcludeOwnerIds || []), ...defaultRestricted];
    excludeOwnerIds = combined.length > 0 ? combined : undefined;
  } else if (UNAUTHENTICATED_RESTRICTED_OWNER_NAMES.length > 0) {
    const resolvedIds = await getOwnerIdsByNames(
      UNAUTHENTICATED_RESTRICTED_OWNER_NAMES,
    );
    excludeOwnerIds = resolvedIds.length > 0 ? resolvedIds : undefined;
  }

  const track = await findTrackByTrackCode(
    trackCode,
    excludeOwnerIds,
    excludeTiers,
  );

  if (!track) {
    return null;
  }

  // Fetch user's liked track codes if authenticated
  let likedTrackCodes: Set<string> | undefined;
  if (userId) {
    const likedCodes = await getUserLikedTrackCodes(userId);
    likedTrackCodes = new Set(likedCodes);
  }

  // Fetch album for the track
  const album = await findAlbumByTrackId(track.id);
  const albumName = album?.title;

  const {
    ownerTypeMap,
    ownerSubTypeMap,
    ownerUsageInfoMap,
    ownerRestrictedCategoriesMap,
    ownerCodeMap,
    ownerUsernameMap,
  } = await fetchOwnerMaps([track]);
  return transformTrackToDetailsDto(
    track,
    likedTrackCodes,
    ownerTypeMap,
    ownerSubTypeMap,
    ownerUsageInfoMap,
    ownerRestrictedCategoriesMap,
    ownerCodeMap,
    ownerUsernameMap,
    albumName,
    activeTokenTypes,
  );
};

// Search tracks by name for autocomplete
export const searchTracksService = async (
  query: string,
  limit: number = 20,
): Promise<TrackSearchResult[]> => {
  return searchTracksByName(query, limit);
};

// Random track preview response interface
export interface RandomTrackPreviewResponse {
  trackCode: string;
  name: string;
  artworkLink: string | null;
  primaryArtist: string | null;
  previewUrl: string;
  expiresInSeconds: number;
}

// Get random track preview with streaming URL (limited to ~15 seconds)
export const getRandomTrackPreviewService = async (
  ownerCode: string,
  _expiresInSeconds: number = 30,
): Promise<RandomTrackPreviewResponse | null> => {
  const { findRandomTrackByOwnerCode } = await import(
    "../../persistence-service/exports"
  );

  // Find a random track with the given owner code
  const track = await findRandomTrackByOwnerCode(ownerCode);

  if (!track) {
    return null;
  }

  // Return streaming endpoint URL instead of signed URL
  // The stream endpoint enforces ~15 second limit server-side
  // Browser/CDN caching (1 hour) minimizes server bandwidth
  const previewUrl = `/tracks/preview-stream/${track.trackCode}`;

  return {
    trackCode: track.trackCode,
    name: track.name,
    artworkLink: track.artworkLink,
    primaryArtist: track.primaryArtist,
    previewUrl,
    expiresInSeconds: 3600, // Cache duration (1 hour)
  };
};
