import { PlaylistCategory, PlaylistStatus, PlaylistType } from "./modules.export";
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
  // type/category are echoed back so the CMS editor can seed its form from the
  // stored values. Without them the edit round-trip silently resets both fields
  // to their defaults on every save.
  type: PlaylistType | null;
  category: PlaylistCategory | null;
  tracks: TrackWithArtists[];
}

// ─── CMS write-side request shapes ───────────────────────────────────────────

export interface CreatePlaylistRequest {
  name: string;
  description?: string | null;
  type?: string;     // PlaylistType — validated in the controller
  category?: string; // PlaylistCategory — validated in the controller
  status?: string;   // PlaylistStatus — validated in the controller
}

// `category: null` explicitly clears the assortment; omitting it leaves the
// stored value untouched.
export interface UpdatePlaylistRequest {
  name?: string;
  description?: string | null;
  type?: string;
  category?: string | null;
  status?: string;
}

export interface SetPlaylistTracksRequest {
  trackCodes: string[];
}
