import {
  findAllPlaylists,
  findPlaylistByCode,
  PlaylistDetail,
} from "../../persistence-service/exports";
import { 
  GetAllPlaylistsParams,
  GetAllPlaylistsQuery,
  GetPlaylistDetailQuery,
  PaginatedPlaylists,
  PlaylistStatus 
} from "../../dto-service/modules.export";

export const getAllPlaylistsService = async (
  query: GetAllPlaylistsQuery,
): Promise<PaginatedPlaylists> => {
  const page = parseInt(query.page || "1", 10);
  const limit = parseInt(query.limit || "10", 10);

  const status = Object.values(PlaylistStatus).includes(query.status as PlaylistStatus)
    ? (query.status as PlaylistStatus)
    : undefined;

  const params: GetAllPlaylistsParams = {
    page: page > 0 ? page : 1,
    limit: limit > 0 && limit <= 100 ? limit : 10,
    status,
  };

  return await findAllPlaylists(params);
};

export const getPlaylistDetailService = async (
  query: GetPlaylistDetailQuery,
): Promise<PlaylistDetail | null> => {
  return await findPlaylistByCode({ playlistCode: query.playlistCode });
};
