export enum DealType {
  BULK = "bulk",
  PRICE_PER_TRACK = "pricePerTrack",
}

export interface OwnerDetail {
  id: string;
  name: string;
  type: string | null;
}

export interface LicenseTrackRequest {
  trackCode: string;
  campaignId?: number;
}

export interface AssignTokensRequest {
  brandId: number;
  tokens?: number;
  type: string;
  expiryDate?: Date;
  ownerIds?: string[];
  dealType?: DealType;
  pricePerPack?: number;
  iprsShare?: number | null;
  hooprShare?: number | null;
  keyName?: string | null;
  isUnlimited?: boolean;
}

export interface LicenseResponse {
  id: number;
  downloadLink: string;
  remainingTokens: number;
  unlimitedTokens?: boolean;
  trackId: string;
  trackName?: string;
  campaignId?: number | null;
}

export interface TokenBalanceItem {
  type: string;
  tokenBalance: number;
  totalAssignedToken: number;
  expiryDate?: Date;
}

export interface AssignTokensResponse {
  id: number;
  brandId: number;
  type: string;
  tokenBalance: number;
  totalAssignedToken: number;
  expiryDate?: Date;
  ownerIds?: string[];
  ownerDetails?: OwnerDetail[];
  pricePerPack?: number | null;
  dealType?: DealType | null;
  iprsShare?: number | null;
  hooprShare?: number | null;
  keyName?: string | null;
  isUnlimited: boolean;
}

export interface LicenseHistoryItem {
  id: number;
  trackId?: string;
  trackName?: string;
  trackCode?: string;
  tokenCost: number;
  licensedAt: Date;
  purchasedDate: Date;
}

export interface BrandLicenseVideoLink {
  id: number;
  url: string;
  status: string;
  trackCode?: string;
  createdAt: Date;
}

export interface BrandLicenseHistoryItem extends LicenseHistoryItem {
  userId: number;
  userEmail?: string;
  videoLinks?: BrandLicenseVideoLink[];
  ownerType?: string;
  ownerSubType?: string;
  primaryArtists?: { id: string; name: string }[];
  type?: string;
  price?: number;
}

export interface BrandLicenseHistoryResponse {
  brandId: number;
  licenses: BrandLicenseHistoryItem[];
  pagination: {
    page: number;
    limit: number;
    totalItems: number;
    totalPages: number;
  };
}

// License Type DTOs
export enum LicenseTypeEnumDTO {
  STANDARD = "standard",
  PREMIUM = "premium",
  ENTERPRISE = "enterprise",
}

export interface CreateLicenseTypeRequest {
  name: string;
  type: LicenseTypeEnumDTO;
  template?: string;
  template_buisness?: string;
  price: number;
}

export interface LicenseTypeResponse {
  id: string;
  name?: string;
  type?: LicenseTypeEnumDTO;
  template?: string;
  template_buisness?: string;
  price?: number;
  discontinued?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface DownloadTrackRequest {
  licenseId: number;
}

export interface DownloadTrackResponse {
  downloadLink: string;
  trackId: string;
  trackName: string;
}

// Video Links DTOs
export interface AddVideoLinksRequest {
  licenseId: number;
  trackCode: string;
  videoLinks: { url: string }[];
}

export interface VideoLinkResponse {
  id: number;
  url: string;
  status: string;
  trackCode?: string;
  licenseId: number;
  isEditable: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface AddVideoLinksResponse {
  videoLinks: VideoLinkResponse[];
}

export interface VideoLinksListResponse {
  licenseId: number;
  videoLinks: VideoLinkResponse[];
}
