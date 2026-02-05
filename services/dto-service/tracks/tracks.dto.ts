import { ArtistType } from "../modules.export";

export interface ArtistInfoTrack {
  id: string;
  name: string;
  type: ArtistType[];
}

// SKU info for track details (both standard and premium)
export interface SkuInfo {
  id: string;
  name?: string;
  costPrice?: number;
  sellingPrice?: number;
  gstPercent?: number;
  maxUsage?: number;
  description?: string;
  token: number;
  skuType: string;
}

export interface TrackWithArtists {
  id: string;
  trackCode: string;
  name: string;
  name_slug: string;
  waveformLink: string | null;
  mp3Link: string | null;
  hasVocals: boolean | null;
  trending: boolean | null;
  primaryArtists: ArtistInfoTrack[];
  token: number; // Token required for standard SKU (default: 1)
}

// Extended track details with both SKUs
export interface TrackDetailsWithSkus extends TrackWithArtists {
  standardSku?: SkuInfo;
  premiumSku?: SkuInfo;
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

// Raw SKU data from database
export interface RawSkuData {
  id?: string;
  name?: string;
  costPrice?: number;
  sellingPrice?: number;
  gstPercent?: number;
  maxUsage?: number;
  description?: string;
  token?: number;
  skuType?: string;
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
  skus?: RawSkuData[];
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
