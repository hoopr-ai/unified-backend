export interface LicenseTrackRequest {
  trackCode: string;
}

export interface AssignTokensRequest {
  brandId: number;
  tokens: number;
  type: string;
  expiryDate?: Date;
}

export interface LicenseResponse {
  id: number;
  downloadLink: string;
  remainingTokens: number;
  trackId: string;
  trackName?: string;
}

export interface TokenBalanceItem {
  type: string;
  tokenBalance: number;
  totalAssignedToken: number;
  expiryDate?: Date;
}

export interface TokenBalanceResponse {
  brandId: number;
  tokens: TokenBalanceItem[];
}

export interface AssignTokensResponse {
  brandId: number;
  type: string;
  tokenBalance: number;
  totalAssignedToken: number;
  expiryDate?: Date;
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

export interface LicenseHistoryResponse {
  licenses: LicenseHistoryItem[];
  pagination: {
    page: number;
    limit: number;
    totalItems: number;
    totalPages: number;
  };
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
