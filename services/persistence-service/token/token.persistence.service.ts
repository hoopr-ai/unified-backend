import { TokenModel, type TokenDetails, TokenAssignedModel, type TokenAssignedDetails, TokenDeductionModel, TokenDeductionReason, type TokenDeductionDetails } from "./schemas/modules.export";
import { sequelize } from "../database";
import { fn, col, literal, Op } from "sequelize";

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
    createdAt: token.createdAt,
    updatedAt: token.updatedAt,
  }));
};

export const addTokensAssignedByType = async (
  brandId: number,
  type: string,
  amount: number,
  expiryDate?: Date,
  ownerIds?: string[]
): Promise<TokenAssignedModel> => {
  return await TokenAssignedModel.create({
    brandId,
    type,
    totalAssignedToken: amount,
    tokenBalance: amount,
    expiryDate,
    ownerIds: ownerIds || [],
  });
};

export const deductTokenAssignedByType = async (
  brandId: number,
  type: string,
  amount: number = 1,
  trackOwnerId?: string,
  reason: TokenDeductionReason = TokenDeductionReason.LICENSE_PURCHASE,
  licenseId?: number
): Promise<{ success: boolean; remainingTokens: number; tokenAssignedId?: number }> => {
  const transaction = await sequelize.transaction();
  try {
    // Find all tokens matching brandId + type with sufficient balance, ordered by createdAt ASC (oldest first - FIFO)
    const tokens = await TokenAssignedModel.findAll({
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

    // Deduct from token_assigned
    await TokenAssignedModel.update(
      { tokenBalance: sequelize.literal(`"tokenBalance" - ${amount}`) },
      { where: { id: matchingToken.id }, transaction }
    );

    // Create deduction record in token_deduction table
    await TokenDeductionModel.create({
      tokenAssignedId: matchingToken.id,
      deductedTokenCount: amount,
      reason,
      licenseId,
      deductedAt: new Date(),
    }, { transaction });

    await transaction.commit();

    const updatedToken = await TokenAssignedModel.findByPk(matchingToken.id, {
      attributes: ["tokenBalance"],
    });

    return {
      success: true,
      remainingTokens: updatedToken?.tokenBalance ?? 0,
      tokenAssignedId: matchingToken.id,
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
      tokenBalance: { [Op.gte]: minBalance },
    },
    order: [["createdAt", "ASC"]],
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
