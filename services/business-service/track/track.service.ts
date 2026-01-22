import {
  findAllTracks,
  PaginatedTracks,
  GetAllTracksParams,
} from "../../persistence-service/exports";

export interface GetAllTracksQuery {
  page?: string;
  limit?: string;
  trending?: string;
}

export const getAllTracksService = async (
  query: GetAllTracksQuery
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
