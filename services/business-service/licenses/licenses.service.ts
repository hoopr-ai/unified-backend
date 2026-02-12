import {
  createLicenseRecord,
  getLicensesByUserId,
  getLicensesByBrandId,
  LicenseModel,
  VideoLinkModel,
  type LicenseDetails,
} from "../../persistence-service/licenses/modules.export";
import {
  findBrandById,
} from "../../persistence-service/brand/modules.export";
import {
  getAllTokenBalances,
  getAllTokenDetails,
  addTokensByType,
  deductTokenByType,
  findTokensByBrandId,
} from "../../persistence-service/token/modules.export";
import { TrackModel } from "../../persistence-service/track/modules.export";
import { UserModel } from "../../persistence-service/user/modules.export";
import { OwnerModel, OwnerType } from "../../persistence-service/owner/modules.export";
import { Op } from "sequelize";
import { AppError, generateGCSSignedUrl } from "../../helper-service/modules.export";
import type {
  LicenseTrackRequest,
  LicenseResponse,
  TokenBalanceResponse,
  LicenseHistoryResponse,
  BrandLicenseHistoryResponse,
  LicenseHistoryItem,
  BrandLicenseHistoryItem,
  DownloadTrackRequest,
  DownloadTrackResponse,
  AssignTokensRequest,
} from "../../dto-service/licenses/modules.export";

const TOKEN_COST_PER_LICENSE = 1;

export const licenseTrackService = async (
  userId: number,
  data: LicenseTrackRequest
): Promise<LicenseResponse> => {
  const { trackCode } = data;

  // Get user's brand
  const user = await UserModel.findByPk(userId, {
    attributes: ["id", "brandId"],
  });

  if (!user) {
    throw new AppError("User not found", 404);
  }

  if (!user.brandId) {
    throw new AppError("User is not associated with any brand", 400);
  }

  const brandId = user.brandId;

  // Get track details including ownerId
  const track = await TrackModel.findOne({
    where: { trackCode },
    attributes: ["id", "trackCode", "name", "ownerId"],
  });
  if (!track) {
    throw new AppError("Track not found", 404);
  }

  // Get owner types for the track
  const ownerIds = track.ownerId || [];
  if (ownerIds.length === 0) {
    throw new AppError("Track has no owners assigned", 400);
  }

  const owners = await OwnerModel.findAll({
    where: { id: { [Op.in]: ownerIds } },
    attributes: ["id", "type"],
  });

  let trackOwnerTypes = [...new Set(owners.map((owner) => owner.type).filter(Boolean))] as OwnerType[];

  if (trackOwnerTypes.length === 0) {
    trackOwnerTypes = [OwnerType.Hoopr]; //need to update later
    // throw new AppError("Track owners do not have valid types", 400);
  }

  // Get brand's token balances
  const brandTokens = await findTokensByBrandId(brandId);

  // Find a matching token type (track owner type matches brand's token type)
  let matchingTokenType: OwnerType | null = null;
  let matchingTokenBalance = 0;

  for (const ownerType of trackOwnerTypes) {
    const brandToken = brandTokens.find((t) => t.type === ownerType && t.tokenBalance >= TOKEN_COST_PER_LICENSE);
    if (brandToken) {
      matchingTokenType = ownerType;
      matchingTokenBalance = brandToken.tokenBalance;
      break;
    }
  }

  if (!matchingTokenType) {
    const availableTypes = brandTokens.filter((t) => t.tokenBalance > 0).map((t) => t.type);
    throw new AppError(
      `No matching tokens available. Track requires tokens of type: ${trackOwnerTypes.join(", ")}. ` +
      `Your available token types: ${availableTypes.length > 0 ? availableTypes.join(", ") : "none"}`,
      400
    );
  }

  // Generate GCS signed URL for the track
  const gcsResult = await generateGCSSignedUrl({ trackId: track.id });

  // Deduct token from the matching type
  const { success, remainingTokens } = await deductTokenByType(brandId, matchingTokenType, TOKEN_COST_PER_LICENSE);

  if (!success) {
    throw new AppError("Failed to process token deduction. Insufficient tokens.", 400);
  }

  // Create license record
  const licenseDetails: LicenseDetails = {
    brandId,
    userId,
    trackId: track.id,
    trackCode: track.trackCode,
    tokenCost: TOKEN_COST_PER_LICENSE,
    licensedAt: new Date(),
    createdAt: new Date(),
  };

  await createLicenseRecord(licenseDetails);

  return {
    downloadLink: gcsResult.downloadLink,
    remainingTokens,
    trackId: track.id,
    trackName: track.name,
  };
};

export interface TokenBalanceByTypeResponse {
  brandId: number;
  tokens: {
    type: OwnerType;
    tokenBalance: number;
    totalAssignedToken: number;
    expiryDate?: Date;
  }[];
}

export const getTokenBalanceService = async (
  userId: number
): Promise<TokenBalanceByTypeResponse> => {
  const user = await UserModel.findByPk(userId, {
    attributes: ["id", "brandId"],
  });

  if (!user) {
    throw new AppError("User not found", 404);
  }

  if (!user.brandId) {
    throw new AppError("User is not associated with any brand", 400);
  }

  const tokens = await getAllTokenBalances(user.brandId);

  return {
    brandId: user.brandId,
    tokens,
  };
};

export interface AssignTokensByTypeRequest {
  brandId: number;
  tokens: number;
  type: OwnerType;
  expiryDate?: Date;
}

export interface AssignTokensByTypeResponse {
  brandId: number;
  type: OwnerType;
  tokenBalance: number;
  totalAssignedToken: number;
  expiryDate?: Date;
}

export const assignTokensService = async (
  brandId: number,
  tokens: number,
  type: OwnerType,
  expiryDate?: Date
): Promise<AssignTokensByTypeResponse> => {
  if (tokens <= 0) {
    throw new AppError("Token amount must be greater than 0", 400);
  }

  if (!Object.values(OwnerType).includes(type)) {
    throw new AppError(`Invalid token type. Must be one of: ${Object.values(OwnerType).join(", ")}`, 400);
  }

  const brand = await findBrandById(brandId);
  if (!brand) {
    throw new AppError("Brand not found", 404);
  }

  const updatedToken = await addTokensByType(brandId, type, tokens, expiryDate);

  return {
    brandId,
    type: updatedToken.type,
    tokenBalance: updatedToken.tokenBalance,
    totalAssignedToken: updatedToken.totalAssignedToken,
    expiryDate: updatedToken.expiryDate,
  };
};

export const getBrandLicenseHistoryService = async (
  userId: number,
  page: number = 1,
  limit: number = 50
): Promise<BrandLicenseHistoryResponse> => {
  // Get user's brand
  const user = await UserModel.findByPk(userId, {
    attributes: ["id", "brandId"],
  });

  if (!user) {
    throw new AppError("User not found", 404);
  }

  if (!user.brandId) {
    throw new AppError("User is not associated with any brand", 400);
  }

  const brandId = user.brandId;

  const { rows, count } = await getLicensesByBrandId(brandId, page, limit);

  // Collect all unique owner IDs from tracks
  const allOwnerIds: string[] = [];
  rows.forEach((license) => {
    const track = license.track as TrackModel | undefined;
    if (track?.ownerId && Array.isArray(track.ownerId)) {
      allOwnerIds.push(...track.ownerId);
    }
  });
  const uniqueOwnerIds = [...new Set(allOwnerIds)];

  // Fetch all owners in one query
  const owners = uniqueOwnerIds.length > 0
    ? await OwnerModel.findAll({
        where: { id: { [Op.in]: uniqueOwnerIds } },
        attributes: ["id", "type"],
      })
    : [];

  // Create a map of owner ID to owner type
  const ownerTypeMap = new Map<string, string>();
  owners.forEach((owner) => {
    if (owner.type) {
      ownerTypeMap.set(owner.id, owner.type);
    }
  });

  const licenses: BrandLicenseHistoryItem[] = rows.map((license) => {
    const track = license.track as TrackModel | undefined;
    const licenseUser = license.user as UserModel | undefined;
    const videoLinks = license.videoLinks as VideoLinkModel[] | undefined;

    // Get owner types for this track
    const ownerTypes: string[] = [];
    if (track?.ownerId && Array.isArray(track.ownerId)) {
      track.ownerId.forEach((oid) => {
        const ownerType = ownerTypeMap.get(oid);
        if (ownerType && !ownerTypes.includes(ownerType)) {
          ownerTypes.push(ownerType);
        }
      });
    }

    return {
      id: license.id,
      trackId: license.trackId,
      trackName: track?.name,
      trackCode: track?.trackCode,
      tokenCost: license.tokenCost,
      licensedAt: license.licensedAt,
      purchasedDate: license.createdAt,
      userId: license.userId,
      userEmail: licenseUser?.email,
      videoLinks: videoLinks?.map((vl) => ({
        id: vl.id,
        url: vl.url,
        type: vl.type,
        status: vl.status,
        trackCode: vl.trackCode,
        createdAt: vl.createdAt,
      })),
      ownerType: ownerTypes.length > 0 ? ownerTypes[0] : undefined,
    };
  });

  return {
    brandId,
    licenses,
    pagination: {
      page,
      limit,
      totalItems: count,
      totalPages: Math.ceil(count / limit),
    },
  };
};

export const downloadTrackService = async (
  userId: number,
  data: DownloadTrackRequest
): Promise<DownloadTrackResponse> => {
  const { licenseId } = data;

  // Get license details
  const license = await LicenseModel.findByPk(licenseId, {
    include: [TrackModel],
  });

  if (!license) {
    throw new AppError("License not found", 404);
  }

  // Verify ownership
  // Check if the user owns the license directly
  if (license.userId !== userId) {
    // Or check if the user belongs to the brand that owns the license
    const user = await UserModel.findByPk(userId);
    if (!user || !user.brandId || user.brandId !== license.brandId) {
      throw new AppError("Unauthorized access to license", 403);
    }
  }

  const track = license.track;
  if (!track) {
    throw new AppError("Track associated with license not found", 404);
  }

  // Generate GCS signed URL for the track
  const gcsResult = await generateGCSSignedUrl({ trackId: track.id });

  // Increment number of downloads
  await license.increment("numberOfDownloads");

  return {
    downloadLink: gcsResult.downloadLink,
    trackId: track.id,
    trackName: track.name || "",
  };
};

export interface TokenDetailsResponse {
  brandId: number;
  tokens: {
    totalAssignedToken: number;
    tokenBalance: number;
    type: OwnerType;
  }[];
}

export const getTokenDetailsService = async (
  userId: number
): Promise<TokenDetailsResponse> => {
  const user = await UserModel.findByPk(userId, {
    attributes: ["id", "brandId"],
  });

  if (!user) {
    throw new AppError("User not found", 404);
  }

  if (!user.brandId) {
    throw new AppError("User is not associated with any brand", 400);
  }

  const tokens = await getAllTokenDetails(user.brandId);

  return {
    brandId: user.brandId,
    tokens: tokens.map((token) => ({
      totalAssignedToken: token.totalAssignedToken,
      tokenBalance: token.tokenBalance,
      type: token.type,
    })),
  };
};
