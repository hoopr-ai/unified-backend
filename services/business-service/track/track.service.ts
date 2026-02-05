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
} from "../../dto-service/modules.export";
import {
  findAllTracks,
  findTracksByTrackCodes,
  findTracksByFilter,
  findTrackByTrackCode,
  type PaginatedRawFilterTracks,
} from "../../persistence-service/exports";

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
const transformTrackToDto = (track: RawTrackWithMappings): TrackWithArtists => {
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
  };
};

// Build paginated response from raw data
const buildPaginatedResponse = (
  rawData: PaginatedRawTracks,
): PaginatedTracksResponseData => {
  const { rows, count, page, limit } = rawData;
  const totalPages = Math.ceil(count / limit);

  return {
    tracks: rows.map(transformTrackToDto),
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
): Promise<PaginatedTracksResponseData> => {
  const { page, limit } = parsePaginationParams(query.page, query.limit);

  const whereClause: Record<string, unknown> = {};
  if (query.trending === "true") {
    whereClause.trending = true;
  }

  const rawData = await findAllTracks(page, limit, whereClause);
  return buildPaginatedResponse(rawData);
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
): Promise<PaginatedTracksResponseData> => {
  const { page, limit } = parsePaginationParams(query.page, query.limit);

  if (!query.trackCodes || !Array.isArray(query.trackCodes) || query.trackCodes.length === 0) {
    return emptyPaginatedResponse(page, limit);
  }
  const rawData = await findTracksByTrackCodes(query.trackCodes, page, limit);

  // Sort tracks in the order of requested trackCodes
  const orderedTracks = sortTracksByRequestedOrder(rawData.rows, query.trackCodes);

  return buildPaginatedResponse({
    ...rawData,
    rows: orderedTracks,
  });
};

export interface GetTracksByFilterQuery {
  filterName: string;
  filterId: string;
  page?: string;
  limit?: string;
}

// Transform raw filter mapping data to paginated response
const buildFilterPaginatedResponse = (
  rawData: PaginatedRawFilterTracks,
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
    .map((mapping) => transformTrackToDto(mapping.track!));

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
): Promise<PaginatedTracksResponseData> => {
  const { page, limit } = parsePaginationParams(query.page, query.limit);

  const rawData = await findTracksByFilter({
    filterId: query.filterId,
    page,
    limit,
  });

  return buildFilterPaginatedResponse(rawData);
};

// Transform raw track data to TrackDetailsWithSkus DTO (includes both SKUs)
const transformTrackToDetailsDto = (track: RawTrackWithMappings): TrackDetailsWithSkus => {
  const baseDto = transformTrackToDto(track);

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

  return {
    ...baseDto,
    standardSku,
    premiumSku,
  };
};

export const getTrackDetailsByCodeService = async (
  trackCode: string,
): Promise<TrackDetailsWithSkus | null> => {
  const track = await findTrackByTrackCode(trackCode);

  if (!track) {
    return null;
  }

  return transformTrackToDetailsDto(track);
};
