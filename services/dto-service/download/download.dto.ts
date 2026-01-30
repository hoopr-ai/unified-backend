export interface DownloadTrackRequest {
  trackId: string;
}

export interface AssignTokensRequest {
  brandId: number;
  tokens: number;
}

export interface DownloadResponse {
  downloadLink: string;
  remainingTokens: number;
  trackId: string;
  trackName?: string;
}

export interface TokenBalanceResponse {
  brandId: number;
  tokens: number;
}

export interface DownloadHistoryItem {
  id: number;
  trackId: string;
  trackName?: string;
  trackCode?: string;
  tokenCost: number;
  downloadedAt: Date;
}

export interface DownloadHistoryResponse {
  downloads: DownloadHistoryItem[];
  pagination: {
    page: number;
    limit: number;
    totalItems: number;
    totalPages: number;
  };
}

export interface BrandDownloadHistoryItem extends DownloadHistoryItem {
  userId: number;
  userEmail?: string;
}

export interface BrandDownloadHistoryResponse {
  brandId: number;
  downloads: BrandDownloadHistoryItem[];
  pagination: {
    page: number;
    limit: number;
    totalItems: number;
    totalPages: number;
  };
}
