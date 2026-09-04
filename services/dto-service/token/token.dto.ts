// Note: AssignTokensRequest, AssignTokensResponse, and TokenBalanceItem are defined in licenses.dto.ts
import type { OwnerDetail, DealType } from "../licenses/licenses.dto";

export interface SetTokenAssignedPriceRequest {
  dealType: DealType;
  pricePerPack: number;
  iprsShare?: number | null;
  hooprShare?: number | null;
  keyName?: string | null;
}

export interface DeductTokensRequest {
  brandId: number;
  type: string;
  amount: number;
  tokenAssignedId?: number;
  reason?: string;
}

export interface TokenListItem {
  id: number;
  brandId: number;
  brandName?: string;
  type: string;
  totalAssignedToken: number;
  tokenBalance: number;
  tokensUsed: number;
  expiryDate?: Date;
  ownerIds?: string[];
  ownerDetails?: OwnerDetail[];
  pricePerPack?: number | null;
  dealType?: DealType | null;
  iprsShare?: number | null;
  hooprShare?: number | null;
  keyName?: string | null;
  isUnlimited: boolean;
  startDate?: Date | null;
  title?: string | null;
  subTitle?: string | null;
  createdAt: Date;
}

export interface TokenListResponse {
  tokens: TokenListItem[];
  pagination: {
    page: number;
    limit: number;
    totalItems: number;
    totalPages: number;
  };
}

export interface TrackDetailForDeduction {
  id: string;
  trackCode: string;
  name: string | null;
  sourceLink: string | null;
  waveformLink: string | null;
  mp3Link: string | null;
}

export interface PurchaserDetail {
  id: number;
  firstName: string | null;
  lastName: string | null;
  email: string;
}

export interface TokenDeductionItem {
  id: number;
  tokenAssignedId: number;
  type: string;
  brandId: number;
  brandName?: string;
  deductedTokenCount: number;
  reason: string;
  licenseId?: number;
  deductedAt: Date;
  trackDetails?: TrackDetailForDeduction | null;
  trackOwnerDetails?: OwnerDetail[];
  purchasedBy?: PurchaserDetail | null;
}

export interface TokenDeductionListResponse {
  deductions: TokenDeductionItem[];
  pagination: {
    page: number;
    limit: number;
    totalItems: number;
    totalPages: number;
  };
}

export interface BrandTokenSummary {
  brandId: number;
  brandName: string;
  totalTokens: number;
  // True if at least one allocation under this brand is unlimited. Aggregated
  // totals exclude unlimited rows (you can't sum infinity into a number), so
  // this flag lets the UI render an "Unlimited" badge instead of misreading 0.
  hasUnlimited: boolean;
}

export interface TokenTypeSummary {
  type: string;
  totalAssigned: number;
  totalBalance: number;
  totalUsed: number;
  // True if at least one allocation of this type is unlimited. See note on
  // BrandTokenSummary.hasUnlimited.
  hasUnlimited: boolean;
}

export interface TokenListFilters {
  brandId?: number;
  type?: string;
  page?: number;
  limit?: number;
  showInternalBrands?: boolean;
}

export interface TokenDeductionFilters {
  brandId?: number;
  type?: string;
  reason?: string;
  page?: number;
  limit?: number;
  showInternalBrands?: boolean;
}
