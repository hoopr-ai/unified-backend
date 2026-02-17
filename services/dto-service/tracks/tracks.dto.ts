import { ArtistType } from "../modules.export";

export interface ArtistInfoTrack {
  id: string;
  name: string;
  type: ArtistType[];
}

// Filter info for track details
export interface FilterInfo {
  id: string;
  name: string;
  slug: string | null;
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
  isLiked: boolean; // Whether the current user has liked this track
  ownerType?: string;
  ownerSubType?: string;
}

// Extended track details with both SKUs and filters
export interface TrackDetailsWithSkus extends TrackWithArtists {
  standardSku?: SkuInfo;
  premiumSku?: SkuInfo;
  languages: FilterInfo[];
  genres: FilterInfo[];
  categories: FilterInfo[];
  occasions: FilterInfo[];
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

// Raw filter mapping data from database
export interface RawFilterMappingData {
  filterId?: string;
  filter?: {
    id: string;
    name: string;
    name_slug?: string | null;
    type?: string;
  };
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
  ownerId?: string[];
  trackArtistMappings?: Array<{
    isPrimary?: boolean;
    artist?: { id: string; name: string; type: ArtistType[] };
  }>;
  skus?: RawSkuData[];
  trackFilterMappings?: RawFilterMappingData[];
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
  type?: string;
}

export interface GetTracksByCodesQuery {
  trackCodes: string[];
  page?: string;
  limit?: string;
}
