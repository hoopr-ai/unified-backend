import type { ArtistInfoTrack } from "./tracks.dto";

export enum StreamType {
  PREVIEW = "PREVIEW",
  PLAY = "PLAY",
}

export interface RecordStreamRequestData {
  trackCode: string;
  streamType: StreamType;
}

export interface StreamTrackInfo {
  id: string;
  name: string;
  name_slug: string;
  mp3Link: string | null;
  waveformLink: string | null;
  duration?: number;
  trending: boolean | null;
  hasVocals: boolean | null;
  ownerType?: string;
  ownerSubType?: string;
  primaryArtists: ArtistInfoTrack[];
  token: number;
}

export interface StreamHistoryItem {
  id: number;
  trackCode: string;
  streamType: StreamType;
  platform?: string;
  count: number;
  firstStreamedAt: Date;
  lastStreamedAt: Date;
  track?: StreamTrackInfo;
}

export interface StreamHistoryResponse {
  streams: StreamHistoryItem[];
  pagination: {
    page: number;
    limit: number;
    totalItems: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
}
