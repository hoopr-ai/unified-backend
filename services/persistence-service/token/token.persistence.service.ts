import { TokenModel, type TokenDetails, TokenAssignedModel, type TokenAssignedDetails, TokenDeductionModel, TokenDeductionReason, type TokenDeductionDetails } from "./schemas/modules.export";
import { BrandModel } from "../brand/schemas/modules.export";
import { LicenseModel } from "../licenses/schemas/licenses.schema";
import { TrackModel } from "../track/schemas/track.schema";
import { UserModel } from "../user/schemas/user.schema";
import { sequelize } from "../database";
import { fn, col, literal, Op } from "sequelize";
import { DealType } from "../../dto-service/modules.export";

export { TokenDeductionReason };

// Sentinel returned in deduction results when the matched allocation is unlimited.
// Callers should treat this as "no balance limit" and skip any low-balance UX.
export const UNLIMITED_TOKEN_BALANCE = Number.MAX_SAFE_INTEGER;

export const getDistinctTokenTypes = async (): Promise<string[]> => {
  const results = await TokenModel.findAll({
    attributes: [[fn("DISTINCT", col("type")), "type"]],
    where: literal('"type" IS NOT NULL'),
    raw: true,
  });
  return results.map((r: any) => r.type as string).filter(Boolean);
};

export const findTokenByBrandAndType = async (
  brandId: number,
  type: string
): Promise<TokenModel[]> => {
  const tokens = await TokenModel.findAll({
    where: { brandId, type },
    order: [["createdAt", "ASC"]],
  });
  return tokens;
};

export const findTokensByBrandId = async (
  brandId: number
): Promise<TokenModel[]> => {
  const tokens = await TokenModel.findAll({
    where: { brandId },
  });
  return tokens;
};

export const getTokenBalanceByType = async (
  brandId: number,
  type: string
): Promise<number> => {
  const tokens = await TokenModel.findAll({
    where: { brandId, type },
    attributes: ["tokenBalance"],
  });
  return tokens.reduce((sum, token) => sum + token.tokenBalance, 0);
};

export const getAllTokenBalances = async (
  brandId: number
): Promise<{ type: string; tokenBalance: number; totalAssignedToken: number; expiryDate?: Date }[]> => {
  const tokens = await TokenModel.findAll({
    where: { brandId },
    attributes: ["type", "tokenBalance", "totalAssignedToken", "expiryDate"],
    order: [["createdAt", "ASC"]],
  });

  // Aggregate by type (sum tokenBalance and totalAssignedToken, take earliest expiryDate)
  const aggregatedMap = new Map<string, { tokenBalance: number; totalAssignedToken: number; expiryDate?: Date }>();

  for (const token of tokens) {
    const existing = aggregatedMap.get(token.type);
    if (existing) {
      existing.tokenBalance += token.tokenBalance;
      existing.totalAssignedToken += token.totalAssignedToken;
      // Keep earliest expiry date if both exist
      if (token.expiryDate) {
        if (!existing.expiryDate || token.expiryDate < existing.expiryDate) {
          existing.expiryDate = token.expiryDate;
        }
      }
    } else {
      aggregatedMap.set(token.type, {
        tokenBalance: token.tokenBalance,
        totalAssignedToken: token.totalAssignedToken,
        expiryDate: token.expiryDate,
      });
    }
  }

  return Array.from(aggregatedMap.entries()).map(([type, data]) => ({
    type,
    ...data,
  }));
};

export const getAllTokenDetails = async (
  brandId: number
): Promise<TokenDetails[]> => {
  const tokens = await TokenModel.findAll({
    where: { brandId },
    order: [["createdAt", "DESC"]],
  });
  return tokens.map((token) => ({
    id: token.id,
    totalAssignedToken: token.totalAssignedToken,
    tokenBalance: token.tokenBalance,
    expiryDate: token.expiryDate,
    brandId: token.brandId,
    type: token.type,
    ownerIds: token.ownerIds,
    createdAt: token.createdAt,
    updatedAt: token.updatedAt,
  }));
};

export const addTokensByType = async (
  brandId: number,
  type: string,
  amount: number,
  expiryDate?: Date,
  ownerIds?: string[]
): Promise<TokenModel> => {
  // Always create a new token entry (multiple entries per type per brand are allowed)
  return await TokenModel.create({
    brandId,
    type,
    totalAssignedToken: amount,
    tokenBalance: amount,
    expiryDate,
    ownerIds: ownerIds || [],
  });
};

export const deductTokenByType = async (
  brandId: number,
  type: string,
  amount: number = 1,
  trackOwnerId?: string
): Promise<{ success: boolean; remainingTokens: number; tokenId?: number }> => {
  const transaction = await sequelize.transaction();
  try {
    // Find all tokens matching brandId + type with sufficient balance, ordered by createdAt ASC (oldest first - FIFO)
    const tokens = await TokenModel.findAll({
      where: {
        brandId,
        type,
        tokenBalance: { [Op.gte]: amount },
      },
      attributes: ["id", "tokenBalance", "ownerIds"],
      order: [["createdAt", "ASC"]],
      lock: transaction.LOCK.UPDATE,
      transaction,
    });

    if (tokens.length === 0) {
      await transaction.rollback();
      return { success: false, remainingTokens: 0 };
    }

    // Find the first matching token based on ownerIds restriction
    // Token is valid if:
    // 1. Token's ownerIds is empty/null (applies to any owner)
    // 2. OR trackOwnerId exists in token's ownerIds array
    let matchingToken: TokenModel | null = null;
    for (const token of tokens) {
      const tokenOwnerIds = token.ownerIds || [];
      if (tokenOwnerIds.length === 0) {
        // Token applies to any owner
        matchingToken = token;
        break;
      } else if (trackOwnerId && tokenOwnerIds.includes(trackOwnerId)) {
        // Track's ownerId is in token's allowed ownerIds
        matchingToken = token;
        break;
      }
    }

    if (!matchingToken) {
      await transaction.rollback();
      // Return total available balance for this type (for error messaging)
      const totalBalance = tokens.reduce((sum, t) => sum + t.tokenBalance, 0);
      return { success: false, remainingTokens: totalBalance };
    }

    await TokenModel.update(
      { tokenBalance: sequelize.literal(`"tokenBalance" - ${amount}`) },
      { where: { id: matchingToken.id }, transaction }
    );

    await transaction.commit();

    const updatedToken = await TokenModel.findByPk(matchingToken.id, {
      attributes: ["tokenBalance"],
    });

    return {
      success: true,
      remainingTokens: updatedToken?.tokenBalance ?? 0,
      tokenId: matchingToken.id,
    };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};

export const findValidTokenForOwner = async (
  brandId: number,
  type: string,
  trackOwnerId: string,
  minBalance: number = 1
): Promise<TokenModel | null> => {
  const tokens = await TokenModel.findAll({
    where: {
      brandId,
      type,
      tokenBalance: { [Op.gte]: minBalance },
    },
    order: [["createdAt", "ASC"]],
  });

  for (const token of tokens) {
    const tokenOwnerIds = token.ownerIds || [];
    // Token is valid if ownerIds is empty (applies to any) or trackOwnerId is in the array
    if (tokenOwnerIds.length === 0 || tokenOwnerIds.includes(trackOwnerId)) {
      return token;
    }
  }

  return null;
};

export const createToken = async (
  tokenDetails: TokenDetails
): Promise<TokenModel> => {
  const token = await TokenModel.create(tokenDetails);
  return token;
};

export const updateToken = async (
  id: number,
  updates: Partial<TokenDetails>
): Promise<[number]> => {
  return await TokenModel.update(updates, { where: { id } });
};

// ============================================
// TOKEN ASSIGNED FUNCTIONS (NEW TABLE)
// ============================================

export const getDistinctTokenAssignedTypes = async (): Promise<string[]> => {
  const results = await TokenAssignedModel.findAll({
    attributes: [[fn("DISTINCT", col("type")), "type"]],
    where: literal('"type" IS NOT NULL'),
    raw: true,
  });
  return results.map((r: any) => r.type as string).filter(Boolean);
};

export const findTokenAssignedByBrandAndType = async (
  brandId: number,
  type: string
): Promise<TokenAssignedModel[]> => {
  const tokens = await TokenAssignedModel.findAll({
    where: { brandId, type },
    order: [["createdAt", "ASC"]],
  });
  return tokens;
};

export const findTokensAssignedByBrandId = async (
  brandId: number
): Promise<TokenAssignedModel[]> => {
  const tokens = await TokenAssignedModel.findAll({
    where: { brandId },
  });
  return tokens;
};

export const getTokenAssignedBalanceByType = async (
  brandId: number,
  type: string
): Promise<number> => {
  const tokens = await TokenAssignedModel.findAll({
    where: { brandId, type },
    attributes: ["tokenBalance"],
  });
  return tokens.reduce((sum, token) => sum + token.tokenBalance, 0);
};

export const getAllTokenAssignedBalances = async (
  brandId: number
): Promise<{ type: string; tokenBalance: number; totalAssignedToken: number; expiryDate?: Date }[]> => {
  const tokens = await TokenAssignedModel.findAll({
    where: { brandId },
    attributes: ["type", "tokenBalance", "totalAssignedToken", "expiryDate"],
    order: [["createdAt", "ASC"]],
  });

  const aggregatedMap = new Map<string, { tokenBalance: number; totalAssignedToken: number; expiryDate?: Date }>();

  for (const token of tokens) {
    const existing = aggregatedMap.get(token.type);
    if (existing) {
      existing.tokenBalance += token.tokenBalance;
      existing.totalAssignedToken += token.totalAssignedToken;
      if (token.expiryDate) {
        if (!existing.expiryDate || token.expiryDate < existing.expiryDate) {
          existing.expiryDate = token.expiryDate;
        }
      }
    } else {
      aggregatedMap.set(token.type, {
        tokenBalance: token.tokenBalance,
        totalAssignedToken: token.totalAssignedToken,
        expiryDate: token.expiryDate,
      });
    }
  }

  return Array.from(aggregatedMap.entries()).map(([type, data]) => ({
    type,
    ...data,
  }));
};

export const getAllTokenAssignedDetails = async (
  brandId: number
): Promise<TokenAssignedDetails[]> => {
  const tokens = await TokenAssignedModel.findAll({
    where: { brandId },
    order: [["createdAt", "DESC"]],
  });
  return tokens.map((token) => ({
    id: token.id,
    totalAssignedToken: token.totalAssignedToken,
    tokenBalance: token.tokenBalance,
    expiryDate: token.expiryDate,
    brandId: token.brandId,
    type: token.type,
    ownerIds: token.ownerIds,
    pricePerPack: token.pricePerPack ?? null,
    dealType: token.dealType ?? null,
    iprsShare: token.iprsShare ?? null,
    hooprShare: token.hooprShare ?? null,
    keyName: token.keyName ?? null,
    isUnlimited: token.isUnlimited,
    createdAt: token.createdAt,
    updatedAt: token.updatedAt,
  }));
};

export const addTokensAssignedByType = async (
  brandId: number,
  type: string,
  amount: number,
  expiryDate?: Date,
  ownerIds?: string[],
  updatedById?: number | null,
  dealType?: DealType | string | null,
  pricePerPack?: number | null,
  iprsShare?: number | null,
  hooprShare?: number | null,
  keyName?: string | null,
  isUnlimited: boolean = false
): Promise<TokenAssignedModel> => {
  // For unlimited rows we still set totalAssignedToken/tokenBalance to 0 — the
  // balance column is never read for unlimited rows (deduction logic short-circuits
  // on the isUnlimited flag), so we keep a sentinel rather than a misleading number.
  return await TokenAssignedModel.create({
    brandId,
    type,
    totalAssignedToken: isUnlimited ? 0 : amount,
    tokenBalance: isUnlimited ? 0 : amount,
    expiryDate: isUnlimited ? undefined : expiryDate,
    ownerIds: ownerIds || [],
    updatedById: updatedById ?? null,
    dealType: isUnlimited ? null : (dealType as DealType ?? null),
    pricePerPack: isUnlimited ? null : (pricePerPack ?? null),
    iprsShare: isUnlimited ? null : (iprsShare ?? null),
    hooprShare: isUnlimited ? null : (hooprShare ?? null),
    keyName: keyName ?? null,
    isUnlimited,
  });
};

export interface SetTokenAssignedPriceData {
  dealType: "bulk" | "pricePerTrack";
  pricePerPack: number;
  iprsShare?: number | null;
  hooprShare?: number | null;
  keyName?: string | null;
}

/**
 * Set or update the pricing details on a token_assigned row.
 * Returns the updated row, or not_found if the row does not exist.
 */
export const setTokenAssignedPrice = async (
  tokenAssignedId: number,
  pricingData: SetTokenAssignedPriceData,
  updatedById?: number | null
): Promise<{ status: "updated" | "not_found"; token?: TokenAssignedModel }> => {
  const transaction = await sequelize.transaction();
  try {
    const token = await TokenAssignedModel.findByPk(tokenAssignedId, {
      lock: transaction.LOCK.UPDATE,
      transaction,
    });

    if (!token) {
      await transaction.rollback();
      return { status: "not_found" };
    }

    await TokenAssignedModel.update(
      {
        dealType: pricingData.dealType as DealType,
        pricePerPack: pricingData.pricePerPack,
        iprsShare: pricingData.iprsShare ?? null,
        hooprShare: pricingData.hooprShare ?? null,
        keyName: pricingData.keyName !== undefined ? pricingData.keyName : token.keyName,
        updatedById: updatedById ?? null,
      },
      { where: { id: tokenAssignedId }, transaction }
    );

    await transaction.commit();

    const refreshed = await TokenAssignedModel.findByPk(tokenAssignedId);
    return { status: "updated", token: refreshed ?? undefined };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};

export const deductTokenAssignedByType = async (
  brandId: number,
  type: string,
  amount: number = 1,
  trackOwnerId?: string,
  reason: TokenDeductionReason = TokenDeductionReason.LICENSE_PURCHASE,
  licenseId?: number
): Promise<{ success: boolean; remainingTokens: number; tokenAssignedId?: number; isUnlimited?: boolean }> => {
  const transaction = await sequelize.transaction();
  try {
    // Eligible rows are either unlimited (always) or have sufficient balance (FIFO).
    // Order: unlimited first, then oldest finite row.
    const tokens = await TokenAssignedModel.findAll({
      where: {
        brandId,
        type,
        [Op.or]: [
          { isUnlimited: true },
          { tokenBalance: { [Op.gte]: amount } },
        ],
      },
      attributes: ["id", "tokenBalance", "ownerIds", "isUnlimited"],
      order: [["isUnlimited", "DESC"], ["createdAt", "ASC"]],
      lock: transaction.LOCK.UPDATE,
      transaction,
    });

    if (tokens.length === 0) {
      await transaction.rollback();
      return { success: false, remainingTokens: 0 };
    }

    // Find the first matching token based on ownerIds restriction
    let matchingToken: TokenAssignedModel | null = null;
    for (const token of tokens) {
      const tokenOwnerIds = token.ownerIds || [];
      if (tokenOwnerIds.length === 0) {
        matchingToken = token;
        break;
      } else if (trackOwnerId && tokenOwnerIds.includes(trackOwnerId)) {
        matchingToken = token;
        break;
      }
    }

    if (!matchingToken) {
      await transaction.rollback();
      const totalBalance = tokens.reduce((sum, t) => sum + t.tokenBalance, 0);
      return { success: false, remainingTokens: totalBalance };
    }

    // For unlimited allocations, skip the balance decrement entirely — but still
    // write the audit row so per-license traceability is preserved.
    if (!matchingToken.isUnlimited) {
      await TokenAssignedModel.update(
        { tokenBalance: sequelize.literal(`"tokenBalance" - ${amount}`) },
        { where: { id: matchingToken.id }, transaction }
      );
    }

    // Create deduction record in token_deduction table
    await TokenDeductionModel.create({
      tokenAssignedId: matchingToken.id,
      deductedTokenCount: amount,
      reason,
      licenseId,
      deductedAt: new Date(),
    }, { transaction });

    await transaction.commit();

    if (matchingToken.isUnlimited) {
      return {
        success: true,
        remainingTokens: UNLIMITED_TOKEN_BALANCE,
        tokenAssignedId: matchingToken.id,
        isUnlimited: true,
      };
    }

    const updatedToken = await TokenAssignedModel.findByPk(matchingToken.id, {
      attributes: ["tokenBalance"],
    });

    return {
      success: true,
      remainingTokens: updatedToken?.tokenBalance ?? 0,
      tokenAssignedId: matchingToken.id,
      isUnlimited: false,
    };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};

export const findValidTokenAssignedForOwner = async (
  brandId: number,
  type: string,
  trackOwnerId: string,
  minBalance: number = 1
): Promise<TokenAssignedModel | null> => {
  const tokens = await TokenAssignedModel.findAll({
    where: {
      brandId,
      type,
      [Op.or]: [
        { isUnlimited: true },
        { tokenBalance: { [Op.gte]: minBalance } },
      ],
    },
    // Unlimited allocations should be considered before finite ones so a brand's
    // unlimited grant always wins when present.
    order: [["isUnlimited", "DESC"], ["createdAt", "ASC"]],
  });

  for (const token of tokens) {
    const tokenOwnerIds = token.ownerIds || [];
    if (tokenOwnerIds.length === 0 || tokenOwnerIds.includes(trackOwnerId)) {
      return token;
    }
  }

  return null;
};

export const createTokenAssigned = async (
  tokenDetails: TokenAssignedDetails
): Promise<TokenAssignedModel> => {
  const token = await TokenAssignedModel.create(tokenDetails);
  return token;
};

export const updateTokenAssigned = async (
  id: number,
  updates: Partial<TokenAssignedDetails>
): Promise<[number]> => {
  return await TokenAssignedModel.update(updates, { where: { id } });
};

// ============================================
// TOKEN DEDUCTION FUNCTIONS (NEW TABLE)
// ============================================

export const getTokenDeductionsByTokenAssignedId = async (
  tokenAssignedId: number
): Promise<TokenDeductionModel[]> => {
  return await TokenDeductionModel.findAll({
    where: { tokenAssignedId },
    order: [["deductedAt", "DESC"]],
  });
};

export const getTokenDeductionsByLicenseId = async (
  licenseId: number
): Promise<TokenDeductionModel | null> => {
  return await TokenDeductionModel.findOne({
    where: { licenseId },
  });
};

export const createTokenDeduction = async (
  deductionDetails: TokenDeductionDetails
): Promise<TokenDeductionModel> => {
  return await TokenDeductionModel.create(deductionDetails);
};

export const createInternalDeduction = async (
  tokenAssignedId: number,
  amount: number
): Promise<{ success: boolean; deduction?: TokenDeductionModel }> => {
  const transaction = await sequelize.transaction();
  try {
    const tokenAssigned = await TokenAssignedModel.findByPk(tokenAssignedId, {
      lock: transaction.LOCK.UPDATE,
      transaction,
    });

    if (!tokenAssigned || tokenAssigned.tokenBalance < amount) {
      await transaction.rollback();
      return { success: false };
    }

    // Deduct from token_assigned
    await TokenAssignedModel.update(
      { tokenBalance: sequelize.literal(`"tokenBalance" - ${amount}`) },
      { where: { id: tokenAssignedId }, transaction }
    );

    // Create deduction record
    const deduction = await TokenDeductionModel.create({
      tokenAssignedId,
      deductedTokenCount: amount,
      reason: TokenDeductionReason.INTERNAL_DEDUCTION,
      deductedAt: new Date(),
    }, { transaction });

    await transaction.commit();
    return { success: true, deduction };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};

// ============================================
// ADMIN/CMS FUNCTIONS
// ============================================

export interface TokenListFilters {
  brandId?: number;
  type?: string;
  page?: number;
  limit?: number;
}

export const findTokenAssignedById = async (id: number): Promise<TokenAssignedModel | null> => {
  return await TokenAssignedModel.findByPk(id);
};

export const getAllTokensWithFilters = async (
  filters: TokenListFilters
): Promise<{ rows: TokenAssignedModel[]; count: number }> => {
  const { brandId, type, page = 1, limit = 20 } = filters;
  const offset = (page - 1) * limit;

  const where: any = {};
  if (brandId) where.brandId = brandId;
  if (type) where.type = type;

  const { rows, count } = await TokenAssignedModel.findAndCountAll({
    where,
    include: [
      {
        model: BrandModel,
        as: "brand",
        attributes: ["id", "name"],
      },
    ],
    order: [["createdAt", "DESC"]],
    limit,
    offset,
  });

  return { rows, count };
};

export const getTokenSummaryAggregatedByType = async (): Promise<
  { type: string; totalAssigned: number; totalBalance: number; hasUnlimited: boolean }[]
> => {
  // Aggregate per type in SQL so totals cover every row, not a paginated slice.
  // Unlimited rows contribute 0 to the sums; hasUnlimited surfaces them via BOOL_OR
  // so the FE can render "Unlimited" instead of misreading the finite-only totals.
  const results = await TokenAssignedModel.findAll({
    attributes: [
      "type",
      [fn("SUM", literal('CASE WHEN "isUnlimited" = false THEN "totalAssignedToken" ELSE 0 END')), "totalAssigned"],
      [fn("SUM", literal('CASE WHEN "isUnlimited" = false THEN "tokenBalance" ELSE 0 END')), "totalBalance"],
      [fn("BOOL_OR", col("isUnlimited")), "hasUnlimited"],
    ],
    group: ["type"],
    raw: true,
  });

  return results.map((r: any) => ({
    type: r.type as string,
    totalAssigned: Number(r.totalAssigned) || 0,
    totalBalance: Number(r.totalBalance) || 0,
    hasUnlimited: r.hasUnlimited === true || r.hasUnlimited === "t" || r.hasUnlimited === "true",
  }));
};

export const getBrandsWithTokens = async (): Promise<{ brandId: number; brandName: string; totalTokens: number; hasUnlimited: boolean }[]> => {
  // SUM tokenBalance across finite allocations only (isUnlimited = false). The
  // hasUnlimited flag is a separate aggregate so the FE can render an
  // "Unlimited" badge next to a brand whose totals would otherwise read 0.
  const results = await TokenAssignedModel.findAll({
    attributes: [
      "brandId",
      [fn("SUM", literal('CASE WHEN "isUnlimited" = false THEN "tokenBalance" ELSE 0 END')), "totalTokens"],
      [fn("BOOL_OR", col("isUnlimited")), "hasUnlimited"],
    ],
    include: [
      {
        model: BrandModel,
        as: "brand",
        attributes: ["name"],
      },
    ],
    group: ["brandId", "brand.id"],
    raw: true,
    nest: true,
  });

  return results.map((r: any) => ({
    brandId: Number(r.brandId),
    brandName: r.brand?.name || "Unknown",
    totalTokens: Number(r.totalTokens) || 0,
    hasUnlimited: r.hasUnlimited === true || r.hasUnlimited === "t" || r.hasUnlimited === "true",
  }));
};

export const getAllDeductionsWithFilters = async (
  filters: {
    brandId?: number;
    type?: string;
    reason?: TokenDeductionReason;
    page?: number;
    limit?: number;
  }
): Promise<{ rows: TokenDeductionModel[]; count: number }> => {
  const { brandId, type, reason, page = 1, limit = 20 } = filters;
  const offset = (page - 1) * limit;

  // Build token_assigned filter
  const tokenAssignedWhere: any = {};
  if (brandId) tokenAssignedWhere.brandId = brandId;
  if (type) tokenAssignedWhere.type = type;

  // Build deduction filter
  const deductionWhere: any = {};
  if (reason) deductionWhere.reason = reason;

  const { rows, count } = await TokenDeductionModel.findAndCountAll({
    where: deductionWhere,
    include: [
      {
        model: TokenAssignedModel,
        as: "tokenAssigned",
        where: Object.keys(tokenAssignedWhere).length > 0 ? tokenAssignedWhere : undefined,
        attributes: ["id", "type", "brandId"],
        include: [
          {
            model: BrandModel,
            as: "brand",
            attributes: ["id", "name"],
          },
        ],
      },
      {
        model: LicenseModel,
        as: "license",
        required: false,
        attributes: ["id", "trackCode", "userId", "licensedAt"],
        include: [
          {
            model: TrackModel,
            as: "track",
            required: false,
            attributes: ["id", "trackCode", "name", "sourceLink", "waveformLink", "mp3Link", "ownerId"],
          },
          {
            model: UserModel,
            as: "user",
            required: false,
            attributes: ["id", "firstName", "lastName", "email"],
          },
        ],
      },
    ],
    order: [["deductedAt", "DESC"]],
    limit,
    offset,
  });

  return { rows, count };
};

/**
 * Deduct tokens for internal/admin use (supports specifying a specific tokenAssignedId)
 */
export const deductTokenAssignedForAdmin = async (
  brandId: number,
  type: string,
  amount: number = 1,
  reason: TokenDeductionReason = TokenDeductionReason.INTERNAL_DEDUCTION,
  tokenAssignedId?: number,
  updatedById?: number | null
): Promise<{ success: boolean; remainingTokens: number; tokenAssignedId?: number; isUnlimited?: boolean }> => {
  const transaction = await sequelize.transaction();
  try {
    let matchingToken: TokenAssignedModel | null = null;

    if (tokenAssignedId) {
      // Specific allocation: must be unlimited or have enough balance.
      matchingToken = await TokenAssignedModel.findOne({
        where: {
          id: tokenAssignedId,
          brandId,
          type,
          [Op.or]: [
            { isUnlimited: true },
            { tokenBalance: { [Op.gte]: amount } },
          ],
        },
        lock: transaction.LOCK.UPDATE,
        transaction,
      });
    } else {
      // Prefer unlimited allocations, otherwise oldest finite row with enough balance.
      const tokens = await TokenAssignedModel.findAll({
        where: {
          brandId,
          type,
          [Op.or]: [
            { isUnlimited: true },
            { tokenBalance: { [Op.gte]: amount } },
          ],
        },
        order: [["isUnlimited", "DESC"], ["createdAt", "ASC"]],
        lock: transaction.LOCK.UPDATE,
        transaction,
      });
      matchingToken = tokens[0] || null;
    }

    if (!matchingToken) {
      await transaction.rollback();
      return { success: false, remainingTokens: 0 };
    }

    // Skip balance decrement for unlimited rows; still record auditor.
    if (matchingToken.isUnlimited) {
      await TokenAssignedModel.update(
        { updatedById: updatedById ?? null },
        { where: { id: matchingToken.id }, transaction }
      );
    } else {
      await TokenAssignedModel.update(
        {
          tokenBalance: sequelize.literal(`"tokenBalance" - ${amount}`),
          updatedById: updatedById ?? null,
        },
        { where: { id: matchingToken.id }, transaction }
      );
    }

    // Create deduction record
    await TokenDeductionModel.create({
      tokenAssignedId: matchingToken.id,
      deductedTokenCount: amount,
      reason,
      deductedAt: new Date(),
      updatedById: updatedById ?? null,
    }, { transaction });

    await transaction.commit();

    if (matchingToken.isUnlimited) {
      return {
        success: true,
        remainingTokens: UNLIMITED_TOKEN_BALANCE,
        tokenAssignedId: matchingToken.id,
        isUnlimited: true,
      };
    }

    const updatedToken = await TokenAssignedModel.findByPk(matchingToken.id, {
      attributes: ["tokenBalance"],
    });

    return {
      success: true,
      remainingTokens: updatedToken?.tokenBalance ?? 0,
      tokenAssignedId: matchingToken.id,
      isUnlimited: false,
    };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};
