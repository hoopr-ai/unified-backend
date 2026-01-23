import { PlaylistModel } from "./schemas/playlist.schema";
import { PlaylistStatus } from "../../dto-service/modules.export";

export interface PlaylistInfo {
  id: string;
  playlistCode: string | null;
  name: string;
  name_slug: string | null;
}

export interface PaginatedPlaylists {
  playlists: PlaylistInfo[];
  pagination: {
    page: number;
    limit: number;
    totalItems: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
}

export interface GetAllPlaylistsParams {
  page: number;
  limit: number;
  status?: PlaylistStatus;
}

export const findAllPlaylists = async (
  params: GetAllPlaylistsParams,
): Promise<PaginatedPlaylists> => {
  const { page, limit, status } = params;
  const offset = (page - 1) * limit;

  const whereClause: Record<string, unknown> = {};

  if (status) {
    whereClause.status = status;
  } else {
    whereClause.status = PlaylistStatus.ACTIVE;
  }

  const { count, rows } = await PlaylistModel.findAndCountAll({
    where: whereClause,
    attributes: ["id", "playlistCode", "name", "name_slug"],
    order: [["createdAt", "DESC"]],
    limit,
    offset,
  });

  const totalPages = Math.ceil(count / limit);

  const playlists: PlaylistInfo[] = rows.map((playlist) => {
    const playlistData = playlist.toJSON() as PlaylistModel;

    return {
      id: playlistData.id,
      playlistCode: playlistData.playlistCode || null,
      name: playlistData.name || "",
      name_slug: playlistData.name_slug || null,
    };
  });

  return {
    playlists,
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
