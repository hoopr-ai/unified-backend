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
} from "../../dto-service/modules.export";
import {
  findAllTracks,
  findTracksByTrackCodes,
  findTracksByFilter,
  findTrackByTrackCode,
  findAlbumByTrackId,
  type PaginatedRawFilterTracks,
} from "../../persistence-service/exports";
import { getUserLikedTrackCodes } from "../../persistence-service/user/liked-track.persistence.service";
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

// Get token from standard SKU, default to 1 if not found
const getStandardToken = (track: RawTrackWithMappings): number => {
  if (track.skus && track.skus.length > 0) {
    // For listing APIs, we only get standard SKU (skuType = 'N')
    const standardSku =
      track.skus.find((sku) => sku.skuType === "N") || track.skus[0];
    return standardSku.token ?? 1;
  }
  return 1; // Default token if no SKU exists
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

// Transform raw track data to TrackWithArtists DTO
const transformTrackToDto = (
  track: RawTrackWithMappings,
  likedTrackCodes?: Set<string>,
  ownerTypeMap?: Map<string, string>,
  ownerSubTypeMap?: Map<string, string>,
  ownerCodeMap?: Map<string, string>,
): TrackWithArtists => {
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

  return {
    id: track.id,
    trackCode: track.trackCode,
    name: track.name || "",
    name_slug: track.name_slug || "",
    waveformLink: track.waveformLink,
    mp3Link: track.mp3Link,
    hasVocals: track.hasVocals,
    trending: track.trending,
    primaryArtists,
    token: getStandardToken(track),
    isLiked: likedTrackCodes ? likedTrackCodes.has(track.trackCode) : false,
    ...(ownerType !== null && { ownerType: ownerType ?? undefined }),
    ...(ownerSubType !== null && { ownerSubType: ownerSubType ?? undefined }),
    ...(ownerCode !== null && { ownerCode: ownerCode ?? undefined }),
  };
};

// Build paginated response from raw data
const buildPaginatedResponse = (
  rawData: PaginatedRawTracks,
  likedTrackCodes?: Set<string>,
  ownerTypeMap?: Map<string, string>,
  ownerSubTypeMap?: Map<string, string>,
  ownerCodeMap?: Map<string, string>,
): PaginatedTracksResponseData => {
  const { rows, count, page, limit } = rawData;
  const totalPages = Math.ceil(count / limit);

  return {
    tracks: rows.map((track) =>
      transformTrackToDto(
        track,
        likedTrackCodes,
        ownerTypeMap,
        ownerSubTypeMap,
        ownerCodeMap,
      ),
    ),
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

export const getAllTracksService = async (
  query: GetAllTracksRequestData,
  userId?: number,
): Promise<PaginatedTracksResponseData> => {
  const { page, limit } = parsePaginationParams(query.page, query.limit);

  const whereClause: Record<string, unknown> = {};
  if (query.trending === true) {
    whereClause.trending = true;
  }

  if (query.newOnHoopr === true) {
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    whereClause.createdAt = { [Op.gte]: oneWeekAgo };
  }

  // Resolve owner IDs from type and ownerCode filters, then intersect
  const [ownerIdsByType, ownerIdsByCode] = await Promise.all([
    resolveOwnerIdsByType(query.type),
    resolveOwnerIdsByOwnerCode(query.ownerCode),
  ]);
  const ownerIds = intersectOwnerIds(ownerIdsByType, ownerIdsByCode);
  if (ownerIds && ownerIds.length === 0) {
    return emptyPaginatedResponse(page, limit);
  }

  // Fetch user's liked track codes if authenticated
  let likedTrackCodes: Set<string> | undefined;
  if (userId) {
    const likedCodes = await getUserLikedTrackCodes(userId);
    likedTrackCodes = new Set(likedCodes);
  }

  const rawData = await findAllTracks(page, limit, whereClause, ownerIds);
  const { ownerTypeMap, ownerSubTypeMap, ownerCodeMap } = await fetchOwnerMaps(
    rawData.rows,
  );
  return buildPaginatedResponse(
    rawData,
    likedTrackCodes,
    ownerTypeMap,
    ownerSubTypeMap,
    ownerCodeMap,
  );
};

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
  );

  // Sort tracks in the order of requested trackCodes
  const orderedTracks = sortTracksByRequestedOrder(
    rawData.rows,
    query.trackCodes,
  );

  const { ownerTypeMap, ownerSubTypeMap, ownerCodeMap } =
    await fetchOwnerMaps(orderedTracks);
  return buildPaginatedResponse(
    {
      ...rawData,
      rows: orderedTracks,
    },
    likedTrackCodes,
    ownerTypeMap,
    ownerSubTypeMap,
    ownerCodeMap,
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
    .map((mapping) =>
      transformTrackToDto(
        mapping.track!,
        likedTrackCodes,
        ownerTypeMap,
        ownerSubTypeMap,
        ownerCodeMap,
      ),
    );

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
): Promise<PaginatedTracksResponseData> => {
  const { page, limit } = parsePaginationParams(query.page, query.limit);

  // If type filter is provided, find matching owner IDs
  const ownerIds = await resolveOwnerIdsByType(query.type);
  if (ownerIds && ownerIds.length === 0) {
    return emptyPaginatedResponse(page, limit);
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
  });

  const filterTracks = rawData.rows.filter((m) => m.track).map((m) => m.track!);
  const { ownerTypeMap, ownerSubTypeMap, ownerCodeMap } =
    await fetchOwnerMaps(filterTracks);
  return buildFilterPaginatedResponse(
    rawData,
    likedTrackCodes,
    ownerTypeMap,
    ownerSubTypeMap,
    ownerCodeMap,
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
): TrackDetailsWithSkus => {
  const baseDto = transformTrackToDto(
    track,
    likedTrackCodes,
    ownerTypeMap,
    ownerSubTypeMap,
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
  if (allArtistNames.length > 0) creditParts.push([...new Set(allArtistNames)].join(", "));
  if (releaseYear) creditParts.push(String(releaseYear));
  if (ownerName) creditParts.push(ownerName);
  const songCredits = albumName && albumName.trim() !== ""
    ? `From '${albumName}' by ${creditParts.join(" | ")}`
    : `'${track.name}' by ${creditParts.join(" | ")}`;

  let standardSku: SkuInfo | undefined;
  let premiumSku: SkuInfo | undefined;

  if (track.skus && track.skus.length > 0) {
    for (const sku of track.skus) {
      const skuInfo: SkuInfo = {
        id: sku.id || "",
        name: sku.name,
        costPrice: sku.costPrice,
        sellingPrice: sku.sellingPrice,
        gstPercent: sku.gstPercent,
        maxUsage: sku.maxUsage,
        description: sku.description,
        token: sku.token ?? 1,
        skuType: sku.skuType || "N",
      };

      if (sku.skuType === "N") {
        standardSku = skuInfo;
      } else if (sku.skuType === "P") {
        premiumSku = skuInfo;
      }
    }
  }

  // Extract filters by type
  const languages = extractFiltersByType(track, FILTER_TYPES.LANGUAGE);
  const genres = extractFiltersByType(track, FILTER_TYPES.GENRE);
  const categories = extractFiltersByType(track, FILTER_TYPES.CATEGORY);
  const occasions = extractFiltersByType(track, FILTER_TYPES.OCCASION);

  return {
    ...baseDto,
    standardSku,
    premiumSku,
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
): Promise<TrackDetailsWithSkus | null> => {
  const track = await findTrackByTrackCode(trackCode);

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
  );
};
