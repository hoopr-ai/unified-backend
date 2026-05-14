import {
  addTokensAssignedByType,
  deductTokenAssignedForAdmin,
  getAllTokensWithFilters,
  getAllTokenAssignedDetails,
  getAllTokenAssignedBalances,
  getDistinctTokenAssignedTypes,
  getTokenSummaryAggregatedByType,
  getBrandsWithTokens,
  getAllDeductionsWithFilters,
  findTokenAssignedById,
  setTokenAssignedPrice,
  getTokenDeductionsByTokenAssignedId,
  TokenDeductionReason,
} from "../../persistence-service/token/modules.export";
import { findBrandById } from "../../persistence-service/brand/brand.persistence.service";
import { getOwnersByIds } from "../../persistence-service/owner/owner.persistence.service";
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
  SetTokenAssignedPriceRequest,
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

  // Collect all unique ownerIds from all tokens
  const allOwnerIds = new Set<string>();
  for (const token of rows) {
    if (token.ownerIds && Array.isArray(token.ownerIds)) {
      for (const id of token.ownerIds) {
        allOwnerIds.add(id);
      }
    }
  }

  // Fetch owner details in one query
  const ownerDetailsMap = new Map<string, { id: string; name: string; type: string | null }>();
  if (allOwnerIds.size > 0) {
    const owners = await getOwnersByIds(Array.from(allOwnerIds));
    for (const owner of owners) {
      ownerDetailsMap.set(owner.id, owner);
    }
  }

  return {
    tokens: rows.map((token: any) => ({
      id: token.id,
      brandId: token.brandId,
      brandName: token.brand?.name || null,
      type: token.type,
      totalAssignedToken: token.totalAssignedToken,
      tokenBalance: token.tokenBalance,
      tokensUsed: token.isUnlimited ? 0 : token.totalAssignedToken - token.tokenBalance,
      expiryDate: token.expiryDate,
      ownerIds: token.ownerIds,
      ownerDetails: token.ownerIds?.map((id: string) => ownerDetailsMap.get(id)).filter(Boolean) || [],
      pricePerPack: token.pricePerPack ?? null,
      dealType: token.dealType ?? null,
      iprsShare: token.iprsShare ?? null,
      hooprShare: token.hooprShare ?? null,
      keyName: token.keyName ?? null,
      isUnlimited: token.isUnlimited === true,
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

  // Collect all unique ownerIds
  const allOwnerIds = new Set<string>();
  for (const token of tokenDetails) {
    if (token.ownerIds && Array.isArray(token.ownerIds)) {
      for (const id of token.ownerIds) {
        allOwnerIds.add(id);
      }
    }
  }

  // Fetch owner details in one query
  const ownerDetailsMap = new Map<string, { id: string; name: string; type: string | null }>();
  if (allOwnerIds.size > 0) {
    const owners = await getOwnersByIds(Array.from(allOwnerIds));
    for (const owner of owners) {
      ownerDetailsMap.set(owner.id, owner);
    }
  }

  // Aggregate by type
  const typeMap = new Map<string, {
    totalAssignedToken: number;
    tokenBalance: number;
    tokensUsed: number;
    allocations: any[];
  }>();

  // Track whether any allocation under a type is unlimited; if so, the type-level
  // aggregates are meaningless (you can't sum a finite number with infinity), so
  // we set a hasUnlimited flag and zero out the rolled-up balance/used numbers.
  const typeHasUnlimited = new Map<string, boolean>();

  for (const token of tokenDetails) {
    const existing = typeMap.get(token.type);
    const isUnlimited = token.isUnlimited === true;
    if (isUnlimited) {
      typeHasUnlimited.set(token.type, true);
    }

    const allocation = {
      id: token.id,
      totalAssignedToken: token.totalAssignedToken,
      tokenBalance: token.tokenBalance,
      tokensUsed: isUnlimited ? 0 : token.totalAssignedToken - token.tokenBalance,
      expiryDate: token.expiryDate,
      ownerIds: token.ownerIds,
      ownerDetails: token.ownerIds?.map((id: string) => ownerDetailsMap.get(id)).filter(Boolean) || [],
      pricePerPack: token.pricePerPack ?? null,
      dealType: token.dealType ?? null,
      iprsShare: token.iprsShare ?? null,
      hooprShare: token.hooprShare ?? null,
      keyName: token.keyName ?? null,
      isUnlimited,
      createdAt: token.createdAt,
    };

    if (existing) {
      if (!isUnlimited) {
        existing.totalAssignedToken += token.totalAssignedToken;
        existing.tokenBalance += token.tokenBalance;
        existing.tokensUsed += (token.totalAssignedToken - token.tokenBalance);
      }
      existing.allocations.push(allocation);
    } else {
      typeMap.set(token.type, {
        totalAssignedToken: isUnlimited ? 0 : token.totalAssignedToken,
        tokenBalance: isUnlimited ? 0 : token.tokenBalance,
        tokensUsed: isUnlimited ? 0 : token.totalAssignedToken - token.tokenBalance,
        allocations: [allocation],
      });
    }
  }

  const tokens = Array.from(typeMap.entries()).map(([type, data]) => ({
    type,
    isUnlimited: typeHasUnlimited.get(type) === true,
    ...data,
  }));

  return { brandId, tokens };
};

/**
 * Assign tokens to a brand (Admin API)
 */
export const assignTokensAdminService = async (
  data: AssignTokensRequest,
  updatedById?: number | null
): Promise<AssignTokensResponse> => {
  const { brandId, tokens, type, expiryDate, ownerIds, dealType, pricePerPack, iprsShare, hooprShare, keyName, isUnlimited } = data;
  const unlimited = isUnlimited === true;

  // Validate type
  if (!type || type.trim() === "") {
    throw new AppError("Token type is required", 400);
  }

  if (!unlimited) {
    if (tokens === undefined || tokens === null || tokens <= 0) {
      throw new AppError("Token amount must be greater than 0", 400);
    }

    if (pricePerPack !== undefined && pricePerPack !== null && pricePerPack <= 0) {
      throw new AppError("pricePerPack must be greater than 0", 400);
    }
  }

  // Validate brand exists
  const brand = await findBrandById(brandId);
  if (!brand) {
    throw new AppError("Brand not found", 404);
  }

  // Create token assignment (preserve original type case).
  // Unlimited grants still carry a bulk pricing block (Pack + IPRS + Hoopr)
  // and an optional expiry — the validator enforces dealType='bulk' and
  // requires pricePerPack for unlimited rows. Only the token count is
  // stored as 0 (the row models an infinite balance).
  const effectiveDealType = unlimited ? "bulk" : (dealType ?? null);
  const tokenAssigned = await addTokensAssignedByType(
    brandId,
    type.trim(),
    unlimited ? 0 : tokens!,
    expiryDate,
    ownerIds,
    updatedById,
    effectiveDealType,
    pricePerPack ?? null,
    effectiveDealType === "bulk" ? (iprsShare ?? null) : null,
    effectiveDealType === "bulk" ? (hooprShare ?? null) : null,
    keyName ?? null,
    unlimited
  );

  // Fetch owner details if ownerIds exist
  const ownerDetails = tokenAssigned.ownerIds && tokenAssigned.ownerIds.length > 0
    ? await getOwnersByIds(tokenAssigned.ownerIds)
    : [];

  return {
    id: tokenAssigned.id,
    brandId: tokenAssigned.brandId,
    type: tokenAssigned.type,
    tokenBalance: tokenAssigned.tokenBalance,
    totalAssignedToken: tokenAssigned.totalAssignedToken,
    expiryDate: tokenAssigned.expiryDate,
    ownerIds: tokenAssigned.ownerIds,
    ownerDetails,
    pricePerPack: tokenAssigned.pricePerPack != null
      ? parseFloat(Number(tokenAssigned.pricePerPack).toFixed(2))
      : null,
    dealType: tokenAssigned.dealType ?? null,
    iprsShare: tokenAssigned.iprsShare ?? null,
    hooprShare: tokenAssigned.hooprShare ?? null,
    keyName: tokenAssigned.keyName ?? null,
    isUnlimited: tokenAssigned.isUnlimited,
  };
};

/**
 * Set or update the pricing details on a token_assigned row.
 */
export const setTokenAssignedPriceService = async (
  tokenAssignedId: number,
  pricingData: SetTokenAssignedPriceRequest,
  updatedById?: number | null
): Promise<AssignTokensResponse> => {
  const { dealType, pricePerPack, iprsShare, hooprShare, keyName } = pricingData;

  if (!Number.isFinite(pricePerPack) || pricePerPack <= 0) {
    throw new AppError("pricePerPack must be greater than 0", 400);
  }

  if (dealType === "bulk") {
    if (iprsShare === undefined || iprsShare === null || !Number.isFinite(iprsShare) || iprsShare < 0) {
      throw new AppError("iprsShare must be a non-negative number when dealType is bulk", 400);
    }
    if (hooprShare === undefined || hooprShare === null || !Number.isFinite(hooprShare) || hooprShare < 0) {
      throw new AppError("hooprShare must be a non-negative number when dealType is bulk", 400);
    }
  }

  // Unlimited allocations also carry a bulk pricing block, but per-track
  // pricing on an unlimited row doesn't make sense (no token count to
  // multiply by) — block that explicitly so the two surfaces stay coherent.
  const existing = await findTokenAssignedById(tokenAssignedId);
  if (!existing) {
    throw new AppError("Token allocation not found", 404);
  }
  if (existing.isUnlimited && dealType !== "bulk") {
    throw new AppError("Unlimited allocations only support bulk pricing", 400);
  }

  const result = await setTokenAssignedPrice(
    tokenAssignedId,
    {
      dealType,
      pricePerPack,
      iprsShare: dealType === "bulk" ? iprsShare : null,
      hooprShare: dealType === "bulk" ? hooprShare : null,
      keyName,
    },
    updatedById
  );

  if (result.status === "not_found") {
    throw new AppError("Token allocation not found", 404);
  }

  const token = result.token!;

  // Fetch owner details if ownerIds exist
  const ownerDetails = token.ownerIds && token.ownerIds.length > 0
    ? await getOwnersByIds(token.ownerIds)
    : [];

  return {
    id: token.id,
    brandId: token.brandId,
    type: token.type,
    tokenBalance: token.tokenBalance,
    totalAssignedToken: token.totalAssignedToken,
    expiryDate: token.expiryDate,
    ownerIds: token.ownerIds,
    ownerDetails,
    pricePerPack: token.pricePerPack ?? null,
    dealType: token.dealType ?? null,
    iprsShare: token.iprsShare ?? null,
    hooprShare: token.hooprShare ?? null,
    keyName: token.keyName ?? null,
    isUnlimited: token.isUnlimited === true,
  };
};

/**
 * Deduct tokens from a brand (Admin API - internal deduction)
 */
export const deductTokensAdminService = async (
  data: DeductTokensRequest,
  updatedById?: number | null
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
    if (token.brandId != brandId) {
      throw new AppError("Token allocation does not belong to this brand", 400);
    }
    if (token.type != type) {
      throw new AppError("Token type mismatch", 400);
    }
  }

  const result = await deductTokenAssignedForAdmin(
    brandId,
    type,
    amount,
    TokenDeductionReason.INTERNAL_DEDUCTION,
    tokenAssignedId,
    updatedById
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
 *
 * `showInternalBrands` defaults to false at the controller layer; we keep it
 * defaulting to undefined here and let the persistence helper decide so any
 * non-HTTP caller of this service keeps the original exclude-by-default
 * behaviour.
 */
export const getBrandsWithTokensService = async (
  options: { showInternalBrands?: boolean } = {}
): Promise<BrandTokenSummary[]> => {
  return await getBrandsWithTokens({
    excludeInternalBrands: options.showInternalBrands === true ? false : true,
  });
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

  // Collect all unique track ownerIds from all deductions
  const allOwnerIds = new Set<string>();
  for (const deduction of rows) {
    const track = (deduction as any).license?.track;
    if (track?.ownerId && Array.isArray(track.ownerId)) {
      for (const id of track.ownerId) {
        allOwnerIds.add(id);
      }
    }
  }

  // Fetch owner details in one query
  const ownerDetailsMap = new Map<string, { id: string; name: string; type: string | null }>();
  if (allOwnerIds.size > 0) {
    const owners = await getOwnersByIds(Array.from(allOwnerIds));
    for (const owner of owners) {
      ownerDetailsMap.set(owner.id, owner);
    }
  }

  return {
    deductions: rows.map((deduction: any) => {
      const license = deduction.license;
      const track = license?.track;
      const user = license?.user;

      return {
        id: deduction.id,
        tokenAssignedId: deduction.tokenAssignedId,
        type: deduction.tokenAssigned?.type || "",
        brandId: deduction.tokenAssigned?.brandId || 0,
        brandName: deduction.tokenAssigned?.brand?.name || null,
        deductedTokenCount: deduction.deductedTokenCount,
        reason: deduction.reason,
        licenseId: deduction.licenseId,
        deductedAt: deduction.deductedAt,
        trackDetails: track ? {
          id: track.id,
          trackCode: track.trackCode,
          name: track.name || null,
          sourceLink: track.sourceLink || null,
          waveformLink: track.waveformLink || null,
          mp3Link: track.mp3Link || null,
        } : null,
        trackOwnerDetails: track?.ownerId?.map((id: string) => ownerDetailsMap.get(id)).filter(Boolean) || [],
        purchasedBy: user ? {
          id: user.id,
          firstName: user.firstName || null,
          lastName: user.lastName || null,
          email: user.email,
        } : null,
      };
    }),
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
 *
 * Unlimited allocations are excluded from totalAssigned / totalBalance /
 * totalUsed — they have no finite balance to sum (their schema-side counters
 * are forced to 0). When at least one row of a type is unlimited, `hasUnlimited`
 * is set on the response so the FE can render "Unlimited" instead of treating
 * the resulting numbers as the full picture.
 */
export const getTokenSummaryByTypeService = async (
  options: { showInternalBrands?: boolean } = {}
): Promise<TokenTypeSummary[]> => {
  const aggregates = await getTokenSummaryAggregatedByType({
    excludeInternalBrands: options.showInternalBrands === true ? false : true,
  });

  return aggregates.map(({ type, totalAssigned, totalBalance, hasUnlimited }) => ({
    type,
    totalAssigned,
    totalBalance,
    totalUsed: totalAssigned - totalBalance,
    hasUnlimited,
  }));
};

/**
 * Get deductions for a specific token allocation
 */
export const getDeductionsByAllocationService = async (
  tokenAssignedId: number
): Promise<{
  tokenAssignedId: number;
  deductions: Array<{
    id: number;
    deductedTokenCount: number;
    reason: string;
    licenseId: number | null;
    deductedAt: Date;
  }>;
}> => {
  // Validate tokenAssignedId exists
  const tokenAssigned = await findTokenAssignedById(tokenAssignedId);
  if (!tokenAssigned) {
    throw new AppError("Token allocation not found", 404);
  }

  const deductions = await getTokenDeductionsByTokenAssignedId(tokenAssignedId);

  return {
    tokenAssignedId,
    deductions: deductions.map((d: any) => ({
      id: d.id,
      deductedTokenCount: d.deductedTokenCount,
      reason: d.reason,
      licenseId: d.licenseId || null,
      deductedAt: d.deductedAt,
    })),
  };
};
