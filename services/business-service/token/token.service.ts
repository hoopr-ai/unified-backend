import {
  addTokensAssignedByType,
  deductTokenAssignedForAdmin,
  getAllTokensWithFilters,
  getAllTokenAssignedDetails,
  getAllTokenAssignedBalances,
  getDistinctTokenAssignedTypes,
  getBrandsWithTokens,
  getAllDeductionsWithFilters,
  findTokenAssignedById,
  TokenDeductionReason,
} from "../../persistence-service/token/modules.export";
import { findBrandById } from "../../persistence-service/brand/brand.persistence.service";
import { AppError } from "../../helper-service/AppError";
import type {
  AssignTokensRequest,
  DeductTokensRequest,
  AssignTokensResponse,
  TokenListResponse,
  TokenDeductionListResponse,
  BrandTokenSummary,
  TokenTypeSummary,
  TokenListFilters,
} from "../../dto-service/modules.export";

/**
 * Get all tokens with filters (for CMS/Admin)
 */
export const getTokensListService = async (
  filters: TokenListFilters
): Promise<TokenListResponse> => {
  const { rows, count } = await getAllTokensWithFilters(filters);
  const page = filters.page || 1;
  const limit = filters.limit || 20;

  return {
    tokens: rows.map((token: any) => ({
      id: token.id,
      brandId: token.brandId,
      brandName: token.brand?.name || null,
      type: token.type,
      totalAssignedToken: token.totalAssignedToken,
      tokenBalance: token.tokenBalance,
      tokensUsed: token.totalAssignedToken - token.tokenBalance,
      expiryDate: token.expiryDate,
      ownerIds: token.ownerIds,
      createdAt: token.createdAt,
    })),
    pagination: {
      page,
      limit,
      totalItems: count,
      totalPages: Math.ceil(count / limit),
    },
  };
};

/**
 * Get token details for a specific brand
 */
export const getTokenDetailsByBrandService = async (
  brandId: number
): Promise<{ brandId: number; tokens: any[] }> => {
  const tokenDetails = await getAllTokenAssignedDetails(brandId);
  const tokenBalances = await getAllTokenAssignedBalances(brandId);

  // Aggregate by type
  const typeMap = new Map<string, {
    totalAssignedToken: number;
    tokenBalance: number;
    tokensUsed: number;
    allocations: any[];
  }>();

  for (const token of tokenDetails) {
    const existing = typeMap.get(token.type);
    const allocation = {
      id: token.id,
      totalAssignedToken: token.totalAssignedToken,
      tokenBalance: token.tokenBalance,
      tokensUsed: token.totalAssignedToken - token.tokenBalance,
      expiryDate: token.expiryDate,
      ownerIds: token.ownerIds,
      createdAt: token.createdAt,
    };

    if (existing) {
      existing.totalAssignedToken += token.totalAssignedToken;
      existing.tokenBalance += token.tokenBalance;
      existing.tokensUsed += (token.totalAssignedToken - token.tokenBalance);
      existing.allocations.push(allocation);
    } else {
      typeMap.set(token.type, {
        totalAssignedToken: token.totalAssignedToken,
        tokenBalance: token.tokenBalance,
        tokensUsed: token.totalAssignedToken - token.tokenBalance,
        allocations: [allocation],
      });
    }
  }

  const tokens = Array.from(typeMap.entries()).map(([type, data]) => ({
    type,
    ...data,
  }));

  return { brandId, tokens };
};

/**
 * Assign tokens to a brand (Admin API)
 */
export const assignTokensAdminService = async (
  data: AssignTokensRequest
): Promise<AssignTokensResponse> => {
  const { brandId, tokens, type, expiryDate, ownerIds } = data;

  // Validate tokens amount
  if (tokens <= 0) {
    throw new AppError("Token amount must be greater than 0", 400);
  }

  // Validate type
  if (!type || type.trim() === "") {
    throw new AppError("Token type is required", 400);
  }

  // Validate brand exists
  const brand = await findBrandById(brandId);
  if (!brand) {
    throw new AppError("Brand not found", 404);
  }

  // Create token assignment
  const tokenAssigned = await addTokensAssignedByType(
    brandId,
    type.trim().toLowerCase(),
    tokens,
    expiryDate,
    ownerIds
  );

  return {
    id: tokenAssigned.id,
    brandId: tokenAssigned.brandId,
    type: tokenAssigned.type,
    tokenBalance: tokenAssigned.tokenBalance,
    totalAssignedToken: tokenAssigned.totalAssignedToken,
    expiryDate: tokenAssigned.expiryDate,
    ownerIds: tokenAssigned.ownerIds,
  };
};

/**
 * Deduct tokens from a brand (Admin API - internal deduction)
 */
export const deductTokensAdminService = async (
  data: DeductTokensRequest
): Promise<{ success: boolean; remainingTokens: number; tokenAssignedId?: number }> => {
  const { brandId, type, amount, tokenAssignedId } = data;

  // Validate amount
  if (amount <= 0) {
    throw new AppError("Deduction amount must be greater than 0", 400);
  }

  // Validate type
  if (!type || type.trim() === "") {
    throw new AppError("Token type is required", 400);
  }

  // If specific tokenAssignedId provided, validate it exists
  if (tokenAssignedId) {
    const token = await findTokenAssignedById(tokenAssignedId);
    if (!token) {
      throw new AppError("Token allocation not found", 404);
    }
    if (token.brandId !== brandId) {
      throw new AppError("Token allocation does not belong to this brand", 400);
    }
    if (token.type !== type.trim().toLowerCase()) {
      throw new AppError("Token type mismatch", 400);
    }
  }

  const result = await deductTokenAssignedForAdmin(
    brandId,
    type.trim().toLowerCase(),
    amount,
    TokenDeductionReason.INTERNAL_DEDUCTION,
    tokenAssignedId
  );

  if (!result.success) {
    throw new AppError("Insufficient tokens for deduction", 400);
  }

  return result;
};

/**
 * Get all distinct token types
 */
export const getTokenTypesService = async (): Promise<string[]> => {
  return await getDistinctTokenAssignedTypes();
};

/**
 * Get all brands with tokens summary
 */
export const getBrandsWithTokensService = async (): Promise<BrandTokenSummary[]> => {
  return await getBrandsWithTokens();
};

/**
 * Get token deductions with filters
 */
export const getTokenDeductionsService = async (
  filters: {
    brandId?: number;
    type?: string;
    reason?: string;
    page?: number;
    limit?: number;
  }
): Promise<TokenDeductionListResponse> => {
  const page = filters.page || 1;
  const limit = filters.limit || 20;

  const reasonEnum = filters.reason as TokenDeductionReason | undefined;

  const { rows, count } = await getAllDeductionsWithFilters({
    brandId: filters.brandId,
    type: filters.type,
    reason: reasonEnum,
    page,
    limit,
  });

  return {
    deductions: rows.map((deduction: any) => ({
      id: deduction.id,
      tokenAssignedId: deduction.tokenAssignedId,
      type: deduction.tokenAssigned?.type || "",
      brandId: deduction.tokenAssigned?.brandId || 0,
      brandName: deduction.tokenAssigned?.brand?.name || null,
      deductedTokenCount: deduction.deductedTokenCount,
      reason: deduction.reason,
      licenseId: deduction.licenseId,
      deductedAt: deduction.deductedAt,
    })),
    pagination: {
      page,
      limit,
      totalItems: count,
      totalPages: Math.ceil(count / limit),
    },
  };
};

/**
 * Get token summary by type (aggregate stats)
 */
export const getTokenSummaryByTypeService = async (): Promise<TokenTypeSummary[]> => {
  const types = await getDistinctTokenAssignedTypes();
  const summaries: TokenTypeSummary[] = [];

  for (const type of types) {
    const { rows } = await getAllTokensWithFilters({ type });

    let totalAssigned = 0;
    let totalBalance = 0;

    for (const token of rows) {
      totalAssigned += token.totalAssignedToken;
      totalBalance += token.tokenBalance;
    }

    summaries.push({
      type,
      totalAssigned,
      totalBalance,
      totalUsed: totalAssigned - totalBalance,
    });
  }

  return summaries;
};
