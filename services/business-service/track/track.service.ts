import {
  findAllTracks,
  findTracksByTrackCodes,
  PaginatedTracks,
  TrackWithArtists,
  GetAllTracksParams,
} from "../../persistence-service/exports";

export interface GetAllTracksQuery {
  page?: string;
  limit?: string;
  trending?: string;
}

export const getAllTracksService = async (
  query: GetAllTracksQuery,
): Promise<PaginatedTracks> => {
  const page = parseInt(query.page || "1", 10);
  const limit = parseInt(query.limit || "10", 10);
  const trending = query.trending === "true" ? true : undefined;

  const params: GetAllTracksParams = {
    page: page > 0 ? page : 1,
    limit: limit > 0 && limit <= 100 ? limit : 10,
    trending,
  };

  return await findAllTracks(params);
};

export interface GetTracksByCodesQuery {
  trackCodes: string[];
  page?: string;
  limit?: string;
}

export const getTracksByCodesService = async (
  query: GetTracksByCodesQuery,
): Promise<PaginatedTracks> => {
  if (!query.trackCodes || !Array.isArray(query.trackCodes)) {
    return {
      tracks: [],
      pagination: {
        page: 1,
        limit: 10,
        totalItems: 0,
        totalPages: 0,
        hasNextPage: false,
        hasPrevPage: false,
      },
    };
  }

  const page = parseInt(query.page || "1", 10);
  const limit = parseInt(query.limit || "10", 10);

  const params: GetAllTracksParams = {
    page: page > 0 ? page : 1,
    limit: limit > 0 && limit <= 100 ? limit : 10,
  };

  return await findTracksByTrackCodes(query.trackCodes, params);
};
