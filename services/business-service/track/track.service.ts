import {
  PaginatedTracks,
  TrackWithArtists,
  ArtistInfoTrack,
  RawTrackWithMappings,
  PaginatedRawTracks,
} from "../../dto-service/modules.export";
import {
  findAllTracks,
  findTracksByTrackCodes,
} from "../../persistence-service/exports";

export interface GetAllTracksQuery {
  page?: string;
  limit?: string;
  trending?: string;
}

export interface GetTracksByCodesQuery {
  trackCodes: string[];
  page?: string;
  limit?: string;
}

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
    sourceLink: track.sourceLink,
    waveformLink: track.waveformLink,
    mp3Link: track.mp3Link,
    hasVocals: track.hasVocals,
    trending: track.trending,
    primaryArtists,
  };
};

// Build paginated response from raw data
const buildPaginatedResponse = (
  rawData: PaginatedRawTracks,
): PaginatedTracks => {
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
const emptyPaginatedResponse = (page: number, limit: number): PaginatedTracks => ({
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
  query: GetAllTracksQuery,
): Promise<PaginatedTracks> => {
  const { page, limit } = parsePaginationParams(query.page, query.limit);

  const whereClause: Record<string, unknown> = {};
  if (query.trending === "true") {
    whereClause.trending = true;
  }

  const rawData = await findAllTracks(page, limit, whereClause);
  return buildPaginatedResponse(rawData);
};

export const getTracksByCodesService = async (
  query: GetTracksByCodesQuery,
): Promise<PaginatedTracks> => {
  const { page, limit } = parsePaginationParams(query.page, query.limit);

  if (!query.trackCodes || !Array.isArray(query.trackCodes) || query.trackCodes.length === 0) {
    return emptyPaginatedResponse(page, limit);
  }
  const rawData = await findTracksByTrackCodes(query.trackCodes, page, limit);
  return buildPaginatedResponse(rawData);
};
