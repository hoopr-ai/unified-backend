// Note: AssignTokensRequest, AssignTokensResponse, and TokenBalanceItem are defined in licenses.dto.ts

export interface SetTokenAssignedPriceRequest {
  pricePerToken: number;
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
}

export interface TokenTypeSummary {
  type: string;
  totalAssigned: number;
  totalBalance: number;
  totalUsed: number;
}

export interface TokenListFilters {
  brandId?: number;
  type?: string;
  page?: number;
  limit?: number;
}

export interface TokenDeductionFilters {
  brandId?: number;
  type?: string;
  reason?: string;
  page?: number;
  limit?: number;
}
