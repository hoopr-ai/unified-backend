export interface LicenseTrackRequest {
  trackId: string;
}

export interface AssignTokensRequest {
  brandId: number;
  tokens: number;
}

export interface LicenseResponse {
  downloadLink: string;
  remainingTokens: number;
  trackId: string;
  trackName?: string;
}

export interface TokenBalanceResponse {
  brandId: number;
  tokens: number;
}

export interface LicenseHistoryItem {
  id: number;
  trackId: string;
  trackName?: string;
  trackCode?: string;
  tokenCost: number;
  licensedAt: Date;
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

export interface BrandLicenseHistoryItem extends LicenseHistoryItem {
  userId: number;
  userEmail?: string;
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
