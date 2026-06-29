import { PlaylistStatus } from "./modules.export";
import { TrackWithArtists } from "../tracks/tracks.dto";

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
  imageLink: string | null;
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

export interface PlaylistDetail {
  id: string;
  playlistCode: string | null;
  name: string;
  name_slug: string | null;
  description: string | null;
  imageLink: string | null;
  tracks: TrackWithArtists[];
}

// ─── CMS write-side request shapes ───────────────────────────────────────────

export interface CreatePlaylistRequest {
  name: string;
  description?: string | null;
  type?: string;   // PlaylistType — validated in the controller
  status?: string; // PlaylistStatus — validated in the controller
}

export interface UpdatePlaylistRequest {
  name?: string;
  description?: string | null;
  type?: string;
  status?: string;
}

export interface SetPlaylistTracksRequest {
  trackCodes: string[];
}
