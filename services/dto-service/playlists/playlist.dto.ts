import { PlaylistStatus } from "./modules.export";
import { ArtistInfoTrack } from "../tracks/tracks.dto";

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

export interface PlaylistTrackInfo {
  id: string;
  trackCode: string;
  name: string;
  name_slug: string | null;
  sourceLink: string | null;
  waveformLink: string | null;
  mp3Link: string | null;
  hasVocals: boolean | null;
  trending: boolean | null;
  primaryArtists: ArtistInfoTrack[];
  ownerType?: string;
  ownerSubType?: string;
}

export interface PlaylistDetail {
  id: string;
  playlistCode: string | null;
  name: string;
  name_slug: string | null;
  description: string | null;
  tracks: PlaylistTrackInfo[];
}
