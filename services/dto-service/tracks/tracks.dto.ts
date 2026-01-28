import { ArtistType } from "../modules.export";

export interface ArtistInfoTrack {
  id: string;
  name: string;
  type: ArtistType[];
}

export interface TrackWithArtists {
  id: string;
  trackCode: string;
  name: string;
  name_slug: string;
  sourceLink: string | null;
  waveformLink: string | null;
  mp3Link: string | null;
  hasVocals: boolean | null;
  trending: boolean | null;
  primaryArtists: ArtistInfoTrack[];
}

export interface PaginatedTracksResponseData {
  tracks: TrackWithArtists[];
  pagination: {
    page: number;
    limit: number;
    totalItems: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
}

export interface GetAllTracksParams {
  page: number;
  limit: number;
  trending?: boolean;
}

export interface RawTrackWithMappings {
  id: string;
  trackCode: string;
  name: string | null;
  name_slug: string | null;
  sourceLink: string | null;
  waveformLink: string | null;
  mp3Link: string | null;
  hasVocals: boolean | null;
  trending: boolean | null;
  trackArtistMappings?: Array<{
    isPrimary?: boolean;
    artist?: { id: string; name: string; type: ArtistType[] };
  }>;
}

export interface PaginatedRawTracks {
  rows: RawTrackWithMappings[];
  count: number;
  page: number;
  limit: number;
}

export interface GetAllTracksRequestData {
  page?: string;
  limit?: string;
  trending?: string;
}

export interface GetTracksByCodesQuery {
  trackCodes: string[];
  page?: string;
  limit?: string;
}
