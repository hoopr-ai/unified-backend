import {
  createLicenseRecord,
  getLicensesByUserId,
  getLicensesByBrandId,
  LicenseModel,
  type LicenseDetails,
} from "../../persistence-service/licenses/modules.export";
import {
  getTokenBalance,
  addTokens,
  deductToken,
  findBrandById,
} from "../../persistence-service/brand/modules.export";
import { TrackModel } from "../../persistence-service/track/modules.export";
import { UserModel } from "../../persistence-service/user/modules.export";
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

  // Check token balance
  const tokenBalance = await getTokenBalance(brandId);
  if (tokenBalance < TOKEN_COST_PER_LICENSE) {
    throw new AppError("Insufficient tokens. Please contact your administrator to add more tokens.", 400);
  }

  // Get track details
  const track = await TrackModel.findOne({
    where: { trackCode },
    attributes: ["id", "trackCode", "name"],
  });
  if (!track) {
    throw new AppError("Track not found", 404);
  }

  // Generate GCS signed URL for the track
  const gcsResult = await generateGCSSignedUrl({ trackId: track.id });

  // Deduct token
  const { success, remainingTokens } = await deductToken(brandId, TOKEN_COST_PER_LICENSE);

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

export const getLicenseHistoryService = async (
  userId: number,
  page: number = 1,
  limit: number = 50
): Promise<LicenseHistoryResponse> => {
  const { rows, count } = await getLicensesByUserId(userId, page, limit);

  const licenses: LicenseHistoryItem[] = rows.map((license) => {
    const track = license.track as TrackModel | undefined;
    return {
      id: license.id,
      trackId: license.trackId,
      trackName: track?.name,
      trackCode: track?.trackCode,
      tokenCost: license.tokenCost,
      licensedAt: license.licensedAt,
    };
  });

  return {
    licenses,
    pagination: {
      page,
      limit,
      totalItems: count,
      totalPages: Math.ceil(count / limit),
    },
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

  const licenses: BrandLicenseHistoryItem[] = rows.map((license) => {
    const track = license.track as TrackModel | undefined;
    const licenseUser = license.user as UserModel | undefined;
    return {
      id: license.id,
      trackId: license.trackId,
      trackName: track?.name,
      trackCode: track?.trackCode,
      tokenCost: license.tokenCost,
      licensedAt: license.licensedAt,
      userId: license.userId,
      userEmail: licenseUser?.email,
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
