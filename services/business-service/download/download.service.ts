import {
  createDownloadRecord,
  getDownloadsByUserId,
  getDownloadsByBrandId,
  type DownloadDetails,
} from "../../persistence-service/download/modules.export";
import {
  getTokenBalance,
  addTokens,
  deductToken,
  findBrandById,
} from "../../persistence-service/brand/modules.export";
import { TrackModel } from "../../persistence-service/track/modules.export";
import { UserModel } from "../../persistence-service/user/modules.export";
import { AppError } from "../../helper-service/modules.export";
import type {
  DownloadTrackRequest,
  DownloadResponse,
  TokenBalanceResponse,
  DownloadHistoryResponse,
  BrandDownloadHistoryResponse,
  DownloadHistoryItem,
  BrandDownloadHistoryItem,
} from "../../dto-service/download/modules.export";

const TOKEN_COST_PER_DOWNLOAD = 1;

export const downloadTrackService = async (
  userId: number,
  data: DownloadTrackRequest
): Promise<DownloadResponse> => {
  const { trackId } = data;

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

  // Check token balance
  const tokenBalance = await getTokenBalance(brandId);
  if (tokenBalance < TOKEN_COST_PER_DOWNLOAD) {
    throw new AppError("Insufficient tokens. Please contact your administrator to add more tokens.", 400);
  }

  // Get track details
  const track = await TrackModel.findByPk(trackId, {
    attributes: ["id", "trackCode", "name", "sourceLink"],
  });

  if (!track) {
    throw new AppError("Track not found", 404);
  }

  if (!track.sourceLink) {
    throw new AppError("Track download link not available", 400);
  }

  // Deduct token
  const { success, remainingTokens } = await deductToken(brandId, TOKEN_COST_PER_DOWNLOAD);

  if (!success) {
    throw new AppError("Failed to process token deduction. Insufficient tokens.", 400);
  }

  // Create download record
  const downloadDetails: DownloadDetails = {
    brandId,
    userId,
    trackId,
    tokenCost: TOKEN_COST_PER_DOWNLOAD,
    downloadedAt: new Date(),
    createdAt: new Date(),
  };

  await createDownloadRecord(downloadDetails);

  return {
    downloadLink: track.sourceLink,
    remainingTokens,
    trackId: track.id,
    trackName: track.name,
  };
};

export const getTokenBalanceService = async (
  userId: number
): Promise<TokenBalanceResponse> => {
  const user = await UserModel.findByPk(userId, {
    attributes: ["id", "brandId"],
  });

  if (!user) {
    throw new AppError("User not found", 404);
  }

  if (!user.brandId) {
    throw new AppError("User is not associated with any brand", 400);
  }

  const tokens = await getTokenBalance(user.brandId);

  return {
    brandId: user.brandId,
    tokens,
  };
};

export const assignTokensService = async (
  brandId: number,
  tokens: number
): Promise<TokenBalanceResponse> => {
  if (tokens <= 0) {
    throw new AppError("Token amount must be greater than 0", 400);
  }

  const brand = await findBrandById(brandId);
  if (!brand) {
    throw new AppError("Brand not found", 404);
  }

  const newBalance = await addTokens(brandId, tokens);

  return {
    brandId,
    tokens: newBalance,
  };
};

export const getDownloadHistoryService = async (
  userId: number,
  page: number = 1,
  limit: number = 50
): Promise<DownloadHistoryResponse> => {
  const { rows, count } = await getDownloadsByUserId(userId, page, limit);

  const downloads: DownloadHistoryItem[] = rows.map((download) => {
    const track = download.track as TrackModel | undefined;
    return {
      id: download.id,
      trackId: download.trackId,
      trackName: track?.name,
      trackCode: track?.trackCode,
      tokenCost: download.tokenCost,
      downloadedAt: download.downloadedAt,
    };
  });

  return {
    downloads,
    pagination: {
      page,
      limit,
      totalItems: count,
      totalPages: Math.ceil(count / limit),
    },
  };
};

export const getBrandDownloadHistoryService = async (
  userId: number,
  page: number = 1,
  limit: number = 50
): Promise<BrandDownloadHistoryResponse> => {
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

  const { rows, count } = await getDownloadsByBrandId(brandId, page, limit);

  const downloads: BrandDownloadHistoryItem[] = rows.map((download) => {
    const track = download.track as TrackModel | undefined;
    const downloadUser = download.user as UserModel | undefined;
    return {
      id: download.id,
      trackId: download.trackId,
      trackName: track?.name,
      trackCode: track?.trackCode,
      tokenCost: download.tokenCost,
      downloadedAt: download.downloadedAt,
      userId: download.userId,
      userEmail: downloadUser?.email,
    };
  });

  return {
    brandId,
    downloads,
    pagination: {
      page,
      limit,
      totalItems: count,
      totalPages: Math.ceil(count / limit),
    },
  };
};
