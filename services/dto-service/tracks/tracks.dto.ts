import { ArtistType } from "../modules.export";

export interface ArtistInfoTrack {
  id: string;
  name: string;
  type: ArtistType[];
}

// Album info for track
export interface AlbumInfo {
  id: string;
  title?: string;
  type?: string;
}

// Campaign info for track
export interface CampaignInfo {
  amount: number;
  type: string;
  currentUsage: number;
  totalUsage: number;
  validTill: Date;
  validFrom: Date;
}

// Filter info for track details
export interface FilterInfo {
  id: string;
  name: string;
  slug: string | null;
}

// Hook timing segment for a track (e.g., chorus markers)
export interface HookTiming {
  start: number;
  end: number;
  label: string;
}

// SKU info for track details (both standard and premium)
export interface SkuInfo {
  id: string;
  costPrice?: number;
  sellingPrice?: number;
  gstPercent?: number;
  maxUsage?: number;
  description?: string;
}

export interface TrackWithArtists {
  id: string;
  trackCode: string;
  name: string;
  name_slug: string;
  waveformLink: string | null;
  mp3Link: string | null;
  sourceLink: string | null;
  hasVocals: boolean | null;
  trending: boolean | null;
  primaryArtists: ArtistInfoTrack[];
  token?: number; // Token required for standard SKU — omitted when brand has no token plan
  isLiked: boolean; // Whether the current user has liked this track
  ownerType?: string;
  ownerSubType?: string;
  ownerCode?: string;
  isEnterpriseOnly?: boolean; // True for Chartbuster tracks — no price, token-only access
  sku?: SkuInfo; // SKU pricing info (prices omitted for enterprise-only tracks)
  album?: AlbumInfo; // Album details for the track
  campaign?: CampaignInfo; // Campaign details (amount and type) if active
  hookTimings: unknown; // Hook timing segments (e.g., chorus markers) — always present; `[]` when none
}

// Extended track details with both SKUs and filters
export interface TrackDetailsWithSkus extends TrackWithArtists {
  sku?: SkuInfo;
  languages: FilterInfo[];
  genres: FilterInfo[];
  categories: FilterInfo[];
  occasions: FilterInfo[];
  description?: string | null;
  usageInfo?: object;
  restrictedCategories?: object;
  ownerCode?: string;
  songCredits?: string;
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
  description?: string | null;
  sourceLink: string | null;
  waveformLink: string | null;
  mp3Link: string | null;
  hasVocals: boolean | null;
  trending: boolean | null;
  releaseDate?: Date | null;
  ownerId?: string[];
  campaignId?: number;
  trackArtistMappings?: Array<{
    isPrimary?: boolean;
    role?: string;
    artist?: { id: string; name: string; type: ArtistType[] };
  }>;
  skus?: RawSkuData[];
  trackFilterMappings?: RawFilterMappingData[];
  album?: { id: string; title?: string; type?: string };
  campaign?: { amount: number; amountType: string; currentUsage: number; totalUsage: number; validFrom: Date; validTill: Date };
  hookTimings?: unknown;
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
  popular?: boolean;
  trending?: boolean;
  newOnHoopr?: boolean;
  movie?: boolean;
  type?: string[];
  ownerCode?: string[];
  subType?: string[];
  campaign?: boolean;
  releaseYearFrom?: number;
  releaseYearTo?: number;
}

export interface GetTracksByCodesQuery {
  trackCodes: string[];
  page?: string;
  limit?: string;
  type?: string[];
}

export const UNAUTHENTICATED_RESTRICTED_OWNER_NAMES: string[] = [
  "YRF Music",
  "Zee Music Company",
];

// Tracks whose price is hidden by default and only shown to users who hold active tokens for the track's ownerType
export const TOKEN_GATED_TRACK_CODES: Set<string> = new Set([
  "20832",
  "20829",
  "20830",
]);
