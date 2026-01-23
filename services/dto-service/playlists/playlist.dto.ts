import { PlaylistStatus } from "./modules.export";

export interface GetAllPlaylistsQuery {
  page?: string;
  limit?: string;
  status?: string;
}

export interface GetPlaylistDetailQuery {
  playlistCode: string;
}

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
