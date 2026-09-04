import type { LicenseExpiryStatus } from "../../business-service/licenses/publishedTerm";
import type { LicenseSort } from "../../persistence-service/licenses/licenses.persistence.service";
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
  // Deal header, shown above the catalogue cards on My Subscription.
  startDate?: Date | null;
  title?: string | null;
  subTitle?: string | null;
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
  // Deal header echoed back so the CMS can render the saved allocation without
  // a re-fetch.
  startDate?: Date | null;
  title?: string | null;
  subTitle?: string | null;
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
  /** When the video went live on the platform. NULL until the platform date is
   *  known — a brand submitting a link does not tell us when it was posted. */
  publishedDate: Date | null;
  /** One year after publishedDate. Derived on read, never stored, so the term
   *  can be changed in one place without a backfill. NULL when publishedDate is. */
  publishedExpiryDate: Date | null;
}

export interface BrandLicenseHistoryItem extends LicenseHistoryItem {
  userId: number;
  /** Earliest publishedDate across this license's video links, and its
   *  +1 year expiry. NULL while no link has a known publish date. */
  publishedDate: Date | null;
  publishedExpiryDate: Date | null;
  /**
   * Which expiry bucket this row is COUNTED under — the same value the chips
   * group by, computed once in SQL so a row can never disagree with the count
   * above it. See publishedTerm.expiryStatusOf for the rule.
   *
   * NULL for SFX: they are free and carry no usage-link obligation, so no
   * bucket applies. They still appear in the list and still count towards
   * `counts.all`, under `counts.notApplicable`.
   */
  expiryStatus: LicenseExpiryStatus | null;
  /**
   * Whole days until the term lapses; negative once it has, null when the
   * licence is unpublished. Sent from the server so every client shows the
   * same number regardless of its clock or timezone.
   *
   * Independent of `expiryStatus`: a row bucketed as `link-not-added` still
   * carries a real countdown here, which is the fact the table displays.
   */
  daysLeft: number | null;
  /** How many links this licence must carry to be complete. Read it rather
   *  than hardcoding 3, so a per-plan requirement later needs no client change.
   *  0 for SFX, which have no usage-link requirement at all. */
  requiredVideoLinks: number;
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

/**
 * Chip counts for the Downloads table.
 *
 * Always describes the WHOLE brand for the current category and IGNORES the
 * active status filter — the chips must keep showing every bucket's size while
 * one is selected, or picking "Expired" collapses the row to a single number.
 * `all` is the sum of the other five: the buckets are mutually exclusive.
 */
export interface DownloadsStatusCountsResponse {
  /** Every licence in the list for this category, INCLUDING SFX — so it always
   *  matches what the user sees. all = the five buckets + notApplicable. */
  all: number;
  expired: number;
  notPublished: number;
  linkNotAdded: number;
  expiringSoon: number;
  active: number;
  /** SFX, which have no expiry status. Non-zero only when the category
   *  includes them; filtering by any status never returns these rows. */
  notApplicable: number;
}

export interface BrandLicenseHistoryResponse {
  brandId: number;
  licenses: BrandLicenseHistoryItem[];
  pagination: {
    page: number;
    limit: number;
    /** Size of the FILTERED set — this drives the pager. Unlike `counts`,
     *  it DOES narrow when `status` is set. */
    totalItems: number;
    totalPages: number;
  };
  counts: DownloadsStatusCountsResponse;
  /** Echoes the filter and sort actually applied, so a client can tell when a
   *  omitted or rejected param fell back to the default. */
  applied: {
    category: "tracks" | "sfx" | null;
    status: LicenseExpiryStatus | null;
    sort: LicenseSort;
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
  publishedDate: Date | null;
  publishedExpiryDate: Date | null;
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
