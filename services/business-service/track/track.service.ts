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
  type PaginatedRawFilterTracks,
} from "../../persistence-service/exports";
import { getUserLikedTrackCodes } from "../../persistence-service/user/liked-track.persistence.service";

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
    const standardSku = track.skus.find((sku) => sku.skuType === "N") || track.skus[0];
    return standardSku.token ?? 1;
  }
  return 1; // Default token if no SKU exists
};

// Transform raw track data to TrackWithArtists DTO
const transformTrackToDto = (
  track: RawTrackWithMappings,
  likedTrackCodes?: Set<string>,
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
  };
};

// Build paginated response from raw data
const buildPaginatedResponse = (
  rawData: PaginatedRawTracks,
  likedTrackCodes?: Set<string>,
): PaginatedTracksResponseData => {
  const { rows, count, page, limit } = rawData;
  const totalPages = Math.ceil(count / limit);

  return {
    tracks: rows.map((track) => transformTrackToDto(track, likedTrackCodes)),
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

// Empty pagination response helper
const emptyPaginatedResponse = (page: number, limit: number): PaginatedTracksResponseData => ({
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
  if (query.trending === "true") {
    whereClause.trending = true;
  }

  // Fetch user's liked track codes if authenticated
  let likedTrackCodes: Set<string> | undefined;
  if (userId) {
    const likedCodes = await getUserLikedTrackCodes(userId);
    likedTrackCodes = new Set(likedCodes);
  }

  const rawData = await findAllTracks(page, limit, whereClause);
  return buildPaginatedResponse(rawData, likedTrackCodes);
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

  if (!query.trackCodes || !Array.isArray(query.trackCodes) || query.trackCodes.length === 0) {
    return emptyPaginatedResponse(page, limit);
  }

  // Fetch user's liked track codes if authenticated
  let likedTrackCodes: Set<string> | undefined;
  if (userId) {
    const likedCodes = await getUserLikedTrackCodes(userId);
    likedTrackCodes = new Set(likedCodes);
  }

  const rawData = await findTracksByTrackCodes(query.trackCodes, page, limit);

  // Sort tracks in the order of requested trackCodes
  const orderedTracks = sortTracksByRequestedOrder(rawData.rows, query.trackCodes);

  return buildPaginatedResponse({
    ...rawData,
    rows: orderedTracks,
  }, likedTrackCodes);
};

export interface GetTracksByFilterQuery {
  filterName: string;
  filterIds: string[];
  page?: string;
  limit?: string;
}

// Transform raw filter mapping data to paginated response
const buildFilterPaginatedResponse = (
  rawData: PaginatedRawFilterTracks,
  likedTrackCodes?: Set<string>,
): PaginatedTracksResponseData => {
  const { rows, count, page, limit } = rawData;
  const totalPages = Math.ceil(count / limit);

  const tracks: TrackWithArtists[] = rows
    .filter((mapping) => {
      if (!mapping.track) {
        console.log(
          `Warning: Skipped track with ID: ${mapping.trackId ?? 'unknown'} - not found in tracks table`,
        );
        return false;
      }
      return true;
    })
    .map((mapping) => transformTrackToDto(mapping.track!, likedTrackCodes));

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
  console.log("Query:", query);

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
  });

  return buildFilterPaginatedResponse(rawData, likedTrackCodes);
};

// Transform raw track data to TrackDetailsWithSkus DTO (includes both SKUs and filters)
const transformTrackToDetailsDto = (
  track: RawTrackWithMappings,
  likedTrackCodes?: Set<string>,
): TrackDetailsWithSkus => {
  const baseDto = transformTrackToDto(track, likedTrackCodes);

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

  return transformTrackToDetailsDto(track, likedTrackCodes);
};
