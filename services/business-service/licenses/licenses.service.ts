import {
  createLicenseRecord,
  getLicensesByUserId,
  getLicensesByBrandId,
  LicenseModel,
  VideoLinkModel,
  type LicenseDetails,
} from "../../persistence-service/licenses/modules.export";
import { findBrandById } from "../../persistence-service/brand/modules.export";
import {
  getAllTokenBalances,
  getAllTokenDetails,
  addTokensByType,
  deductTokenByType,
  findTokensByBrandId,
  getDistinctTokenTypes,
} from "../../persistence-service/token/modules.export";
import { TrackModel } from "../../persistence-service/track/modules.export";
import { UserModel, findAllActiveUsersByBrandId } from "../../persistence-service/user/modules.export";
import { OwnerModel } from "../../persistence-service/owner/modules.export";
import { Op } from "sequelize";
import {
  AppError,
  generateGCSSignedUrl,
  uploadBufferToGCS,
  generateLicensePdf,
  sendTrackDownloadNotificationEmail,
  sendLowCreditsAlertEmail,
} from "../../helper-service/modules.export";
import { logger } from "../../helper-service/logger";
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
  data: LicenseTrackRequest,
): Promise<LicenseResponse> => {
  const { trackCode } = data;

  // Get user's brand
  const user = await UserModel.findByPk(userId, {
    attributes: ["id", "brandId", "email", "firstName", "lastName"],
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
    attributes: ["id", "trackCode", "name", "ownerId", "mp3Link"],
  });
  if (!track) {
    throw new AppError("Track not found", 404);
  }

  if (!track.mp3Link) {
    throw new AppError("Track audio file is not available for download", 400);
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

  let trackOwnerTypes = [
    ...new Set(owners.map((owner) => owner.type).filter(Boolean)),
  ] as string[];

  if (trackOwnerTypes.length === 0) {
    trackOwnerTypes = ["Hoopr"]; //need to update later
    // throw new AppError("Track owners do not have valid types", 400);
  }

  // Get brand's token balances
  const brandTokens = await findTokensByBrandId(brandId);

  // Find a matching token type (track owner type matches brand's token type)
  let matchingTokenType: string | null = null;
  let matchingTokenBalance = 0;

  for (const ownerType of trackOwnerTypes) {
    const brandToken = brandTokens.find(
      (t) => t.type === ownerType && t.tokenBalance >= TOKEN_COST_PER_LICENSE,
    );
    if (brandToken) {
      matchingTokenType = ownerType;
      matchingTokenBalance = brandToken.tokenBalance;
      break;
    }
  }

  if (!matchingTokenType) {
    throw new AppError(
      `You don't have enough credits to license this track. Please contact your administrator to top up your credits.`,
      400,
    );
  }

  // Generate GCS signed URL for the track
  const gcsResult = await generateGCSSignedUrl({ trackId: track.id });

  // Deduct token from the matching type
  const { success, remainingTokens } = await deductTokenByType(
    brandId,
    matchingTokenType,
    TOKEN_COST_PER_LICENSE,
  );

  if (!success) {
    throw new AppError(
      "Failed to process token deduction. Insufficient tokens.",
      400,
    );
  }

  // Create license record
  const licenseDetails: LicenseDetails = {
    brandId,
    userId,
    trackCode: track.trackCode,
    tokenCost: TOKEN_COST_PER_LICENSE,
    licensedAt: new Date(),
    createdAt: new Date(),
  };

  const createdLicense = await createLicenseRecord(licenseDetails);

  // Notify entire team about the track download
  const downloadedByFullName = [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email || "";

  findAllActiveUsersByBrandId(brandId)
    .then((teamMembers) => {
      teamMembers.forEach((member) => {
        if (member.email) {
          sendTrackDownloadNotificationEmail(member.email, {
            recipientFirstName: member.firstName || "",
            trackName: track.name || trackCode,
            assortmentType: matchingTokenType!,
            creditsRemaining: remainingTokens,
            downloadedByFullName,
          }).catch((err) => {
            logger.error("Failed to send track download notification email", {
              recipientEmail: member.email,
              error: err.message,
            });
          });
        }
      });
    })
    .catch((err) => {
      logger.error("Failed to fetch team members for track download notification", {
        brandId,
        error: err.message,
      });
    });

  // Send low credits alert to whole team if remaining tokens drop below 2
  if (remainingTokens < 2) {
    findAllActiveUsersByBrandId(brandId)
      .then((teamMembers) => {
        teamMembers.forEach((member) => {
          if (member.email) {
            sendLowCreditsAlertEmail(member.email, {
              recipientFirstName: member.firstName || "",
              assortmentType: matchingTokenType!,
              creditsRemaining: remainingTokens,
            }).catch((err) => {
              logger.error("Failed to send low credits alert email", {
                recipientEmail: member.email,
                error: err.message,
              });
            });
          }
        });
      })
      .catch((err) => {
        logger.error("Failed to fetch team members for low credits alert", {
          brandId,
          error: err.message,
        });
      });
  }

  return {
    id: createdLicense.id!,
    downloadLink: gcsResult.downloadLink,
    remainingTokens,
    trackId: track.id,
    trackName: track.name,
  };
};

export interface TokenBalanceByTypeResponse {
  brandId: number;
  tokens: {
    type: string;
    tokenBalance: number;
    totalAssignedToken: number;
    expiryDate?: Date;
  }[];
}

export const getTokenBalanceService = async (
  userId: number,
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
  type: string;
  expiryDate?: Date;
}

export interface AssignTokensByTypeResponse {
  brandId: number;
  type: string;
  tokenBalance: number;
  totalAssignedToken: number;
  expiryDate?: Date;
}

export const assignTokensService = async (
  brandId: number,
  tokens: number,
  type: string,
  expiryDate?: Date,
): Promise<AssignTokensByTypeResponse> => {
  if (tokens <= 0) {
    throw new AppError("Token amount must be greater than 0", 400);
  }

  if (!type || type.trim().length === 0) {
    throw new AppError("Token type is required", 400);
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
  limit: number = 50,
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
  const owners =
    uniqueOwnerIds.length > 0
      ? await OwnerModel.findAll({
          where: { id: { [Op.in]: uniqueOwnerIds } },
          attributes: ["id", "type", "subType"],
        })
      : [];

  // Create maps of owner ID to owner type and subType
  const ownerTypeMap = new Map<string, string>();
  const ownerSubTypeMap = new Map<string, string>();
  owners.forEach((owner) => {
    if (owner.type) {
      ownerTypeMap.set(owner.id, owner.type);
    }
    if (owner.subType) {
      ownerSubTypeMap.set(owner.id, owner.subType);
    }
  });

  const licenses: BrandLicenseHistoryItem[] = rows.map((license) => {
    const track = license.track as TrackModel | undefined;
    const licenseUser = license.user as UserModel | undefined;
    const videoLinks = license.videoLinks as VideoLinkModel[] | undefined;

    // Get owner types and sub types for this track
    const ownerTypes: string[] = [];
    const ownerSubTypes: string[] = [];
    if (track?.ownerId && Array.isArray(track.ownerId)) {
      track.ownerId.forEach((oid) => {
        const ownerType = ownerTypeMap.get(oid);
        if (ownerType && !ownerTypes.includes(ownerType)) {
          ownerTypes.push(ownerType);
        }
        const ownerSubType = ownerSubTypeMap.get(oid);
        if (ownerSubType && !ownerSubTypes.includes(ownerSubType)) {
          ownerSubTypes.push(ownerSubType);
        }
      });
    }

    const primaryArtists = (track as any)?.trackArtistMappings
      ?.filter((m: any) => m.isPrimary && m.artist)
      .map((m: any) => ({ id: m.artist.id, name: m.artist.name })) ?? [];

    return {
      id: license.id,
      trackId: track?.id,
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
        status: vl.status,
        trackCode: vl.trackCode,
        createdAt: vl.createdAt,
      })),
      ownerType: ownerTypes.length > 0 ? ownerTypes[0] : undefined,
      ownerSubType: ownerSubTypes.length > 0 ? ownerSubTypes[0] : undefined,
      primaryArtists,
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
  data: DownloadTrackRequest,
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

  if (!track.mp3Link) {
    throw new AppError("Track audio file is not available for download", 400);
  }

  // Generate GCS signed URL for the track
  const gcsResult = await generateGCSSignedUrl({ trackId: track.id });

  return {
    downloadLink: gcsResult.downloadLink,
    trackId: track.id,
    trackName: track.name || "",
  };
};

export interface DownloadLicensePdfResponse {
  downloadLink: string;
}

export const downloadLicensePdfService = async (
  userId: number,
  data: { licenseId: number },
): Promise<DownloadLicensePdfResponse> => {
  const { licenseId } = data;

  const license = await LicenseModel.findByPk(licenseId, {
    include: [TrackModel],
  });

  if (!license) {
    throw new AppError("License not found", 404);
  }

  // Verify ownership
  if (license.userId !== userId) {
    const user = await UserModel.findByPk(userId);
    if (!user || !user.brandId || user.brandId !== license.brandId) {
      throw new AppError("Unauthorized access to license", 403);
    }
  }

  const track = license.track;
  if (!track) {
    throw new AppError("Track associated with license not found", 404);
  }

  // Fetch user details
  const user = await UserModel.findByPk(license.userId, {
    attributes: ["id", "firstName", "lastName", "email", "mobile"],
  });
  if (!user) {
    throw new AppError("License user not found", 404);
  }

  // Fetch owner username
  let ownerName = "";
  const ownerIds = track.ownerId || [];
  if (ownerIds.length > 0) {
    const owner = await OwnerModel.findByPk(ownerIds[0], {
      attributes: ["id", "username"],
    });
    ownerName = owner?.username || "";
  }

  // Format date as DD/MM/YYYY
  const licensedDate = new Date(license.licensedAt);
  const formattedDate = `${String(licensedDate.getDate()).padStart(2, "0")}/${String(licensedDate.getMonth() + 1).padStart(2, "0")}/${licensedDate.getFullYear()}`;

  // Generate PDF
  const pdfBuffer = await generateLicensePdf({
    name: [user.firstName, user.lastName].filter(Boolean).join(" "),
    email: user.email || "",
    mobile: user.mobile || "",
    date: formattedDate,
    trackName: track.name || "",
    ownerName,
  });

  // Upload to GCS
  const gcsPath = `licenses-pdf/${licenseId}/license-agreement.pdf`;
  const downloadLink = await uploadBufferToGCS({
    buffer: pdfBuffer,
    gcsPath,
    contentType: "application/pdf",
  });

  return { downloadLink };
};

export interface TokenDetailsResponse {
  brandId: number;
  tokens: {
    totalAssignedToken: number;
    tokensUsed: number;
    tokenBalance: number;
    type: string;
  }[];
}

export const getTokenDetailsService = async (
  userId: number,
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

  const [tokens, allTokenTypes] = await Promise.all([
    getAllTokenDetails(user.brandId),
    getDistinctTokenTypes(),
  ]);

  const assignedTokenMap = new Map(tokens.map((t) => [t.type, t]));

  const mergedTokens = allTokenTypes.map((type) => {
    const token = assignedTokenMap.get(type);
    if (token) {
      return {
        totalAssignedToken: token.totalAssignedToken,
        tokensUsed: token.totalAssignedToken - token.tokenBalance,
        tokenBalance: token.tokenBalance,
        type: token.type,
      };
    }
    return {
      totalAssignedToken: 0,
      tokensUsed: 0,
      tokenBalance: 0,
      type,
    };
  });

  return {
    brandId: user.brandId,
    tokens: mergedTokens,
  };
};
