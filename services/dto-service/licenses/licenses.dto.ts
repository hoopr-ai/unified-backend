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
  validThrough: Date;
  campaignId?: number | null;
  isSfx?: boolean; // True when the licensed track is an SFX track
  freeDownload?: boolean; // True when no tokens/payment were required for this license
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
  validThrough?: Date | null;
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
  isSfx?: boolean; // True when the licensed track is an SFX track
  freeDownload?: boolean; // True for SFX — downloaded without tokens/payment
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
  /** Deliver the mix plus every stem as one zip instead of the bare mp3. */
  includeStems?: boolean;
}

export interface DownloadTrackResponse {
  downloadLink: string;
  trackId: string;
  trackName: string;
  /**
   * Marks a completed download. Present on every response so a client can
   * branch on one field; the bare-mp3 path has always been immediate and stays
   * that way.
   */
  status?: "ready";
  /** Files inside the zip — mix included. Absent for a plain mp3 download. */
  fileCount?: number;
  /**
   * Bundle size. The client fetches the signed URL itself to show progress, and
   * cross-origin `Content-Length` is not always readable, so the size is sent
   * here rather than left to the browser to discover.
   */
  sizeBytes?: number;
}

/**
 * A stem bundle is zipped on the first request for a track and cached after
 * that, so only the first downloader waits. Until it exists the endpoint
 * answers 202 with this and the client polls.
 */
export interface DownloadTrackPending {
  status: "preparing";
  retryAfterMs: number;
}

export type DownloadTrackResult =
  | DownloadTrackResponse
  | DownloadTrackPending;

export const isDownloadPending = (
  result: DownloadTrackResult,
): result is DownloadTrackPending => result.status === "preparing";

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
