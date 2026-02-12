import { TokenModel, type TokenDetails } from "./schemas/modules.export";
import { OwnerType } from "../owner/schemas/owner.schema";
import { sequelize } from "../database";

export const findTokenByBrandAndType = async (
  brandId: number,
  type: OwnerType
): Promise<TokenModel | null> => {
  const token = await TokenModel.findOne({
    where: { brandId, type },
  });
  return token;
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
  type: OwnerType
): Promise<number> => {
  const token = await TokenModel.findOne({
    where: { brandId, type },
    attributes: ["tokenBalance"],
  });
  return token?.tokenBalance ?? 0;
};

export const getAllTokenBalances = async (
  brandId: number
): Promise<{ type: OwnerType; tokenBalance: number; totalAssignedToken: number; expiryDate?: Date }[]> => {
  const tokens = await TokenModel.findAll({
    where: { brandId },
    attributes: ["type", "tokenBalance", "totalAssignedToken", "expiryDate"],
  });
  return tokens.map((token) => ({
    type: token.type,
    tokenBalance: token.tokenBalance,
    totalAssignedToken: token.totalAssignedToken,
    expiryDate: token.expiryDate,
  }));
};

export const addTokensByType = async (
  brandId: number,
  type: OwnerType,
  amount: number,
  expiryDate?: Date
): Promise<TokenModel> => {
  const existingToken = await TokenModel.findOne({
    where: { brandId, type },
  });

  if (existingToken) {
    // Update existing token record
    await TokenModel.update(
      {
        totalAssignedToken: sequelize.literal(`"totalAssignedToken" + ${amount}`),
        tokenBalance: sequelize.literal(`"tokenBalance" + ${amount}`),
        ...(expiryDate && { expiryDate }),
      },
      { where: { id: existingToken.id } }
    );
    const updatedToken = await TokenModel.findByPk(existingToken.id);
    return updatedToken!;
  } else {
    // Create new token record
    const newToken = await TokenModel.create({
      brandId,
      type,
      totalAssignedToken: amount,
      tokenBalance: amount,
      expiryDate,
    });
    return newToken;
  }
};

export const deductTokenByType = async (
  brandId: number,
  type: OwnerType,
  amount: number = 1
): Promise<{ success: boolean; remainingTokens: number }> => {
  const transaction = await sequelize.transaction();
  try {
    const token = await TokenModel.findOne({
      where: { brandId, type },
      attributes: ["id", "tokenBalance"],
      lock: transaction.LOCK.UPDATE,
      transaction,
    });

    if (!token) {
      await transaction.rollback();
      return { success: false, remainingTokens: 0 };
    }

    if (token.tokenBalance < amount) {
      await transaction.rollback();
      return { success: false, remainingTokens: token.tokenBalance };
    }

    await TokenModel.update(
      { tokenBalance: sequelize.literal(`"tokenBalance" - ${amount}`) },
      { where: { id: token.id }, transaction }
    );

    await transaction.commit();

    const updatedToken = await TokenModel.findByPk(token.id, {
      attributes: ["tokenBalance"],
    });

    return { success: true, remainingTokens: updatedToken?.tokenBalance ?? 0 };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
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
