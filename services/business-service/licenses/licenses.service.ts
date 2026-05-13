import {
  createLicenseRecord,
  getLicensesByBrandId,
  LicenseModel,
  VideoLinkModel,
  type LicenseDetails,
  countLicensesWithMissingVideoLinks,
} from "../../persistence-service/licenses/modules.export";
import { findBrandById } from "../../persistence-service/brand/modules.export";
import {
  getAllTokenBalances,
  getAllTokenDetails,
  addTokensByType,
  deductTokenByType,
  findTokensByBrandId,
  getDistinctTokenTypes,
  findValidTokenForOwner,
  // New token_assigned functions
  getAllTokenAssignedBalances,
  getAllTokenAssignedDetails,
  addTokensAssignedByType,
  deductTokenAssignedByType,
  findTokensAssignedByBrandId,
  getDistinctTokenAssignedTypes,
  findValidTokenAssignedForOwner,
  TokenDeductionReason,
} from "../../persistence-service/token/modules.export";
import { TrackModel } from "../../persistence-service/track/modules.export";
import { UserModel, findAllActiveUsersByBrandId } from "../../persistence-service/user/modules.export";
import { OwnerModel, getOwnersByIds } from "../../persistence-service/owner/modules.export";
import { CampaignModel, CampaignStatus } from "../../persistence-service/campaign/modules.export";
import { Op, literal } from "sequelize";
import {
  AppError,
  generateGCSSignedUrl,
  uploadBufferToGCS,
  getGCSSignedUrl,
  generateLicensePdf,
  sendTrackDownloadNotificationEmail,
  sendLowCreditsAlertEmail,
} from "../../helper-service/modules.export";
import { logger } from "../../helper-service/logger";
import type {
  LicenseTrackRequest,
  LicenseResponse,
  BrandLicenseHistoryResponse,
  BrandLicenseHistoryItem,
  DownloadTrackRequest,
  DownloadTrackResponse,
} from "../../dto-service/licenses/modules.export";
import { Platform } from "../../dto-service/modules.export";

const TOKEN_COST_PER_LICENSE = 1;

export const licenseTrackService = async (
  userId: number,
  data: LicenseTrackRequest,
  platform?: Platform,
): Promise<LicenseResponse> => {
  const { trackCode, campaignId: requestedCampaignId } = data;
  const isSoundTrackingApp = platform === Platform.SOUND_TRACKING_APP;

  // campaignId is only honored for SOUND_TRACKING_APP. Defense-in-depth: even if a
  // non-SOUND_TRACKING_APP request slips one in via the service layer, we drop it.
  const campaignIdToApply = isSoundTrackingApp ? requestedCampaignId : undefined;

  // Validate + atomically reserve a campaign slot before creating any license record.
  // A single conditional UPDATE handles "exists, ACTIVE, in-window, has slots" race-safely:
  // if affectedRows === 0, one of those conditions failed.
  if (campaignIdToApply !== undefined) {
    const now = new Date();
    const [affectedRows] = await CampaignModel.update(
      { currentUsage: literal('"currentUsage" + 1') } as any,
      {
        where: {
          id: campaignIdToApply,
          status: CampaignStatus.ACTIVE,
          validFrom: { [Op.lte]: now },
          validTill: { [Op.gte]: now },
          currentUsage: { [Op.lt]: literal('"totalUsage"') },
        },
      },
    );

    if (affectedRows === 0) {
      // Distinguish between "doesn't exist" and "exists but ineligible" for a clearer message.
      const campaign = await CampaignModel.findByPk(campaignIdToApply, {
        attributes: ["id", "status", "validFrom", "validTill", "currentUsage", "totalUsage"],
      });
      if (!campaign) {
        throw new AppError("Campaign not found", 404);
      }
      throw new AppError(
        "Campaign is not active, has expired, or has reached its usage limit",
        400,
      );
    }
  }

  // Get user (brand only required for non-SOUND_TRACKING_APP platforms)
  const user = await UserModel.findByPk(userId, {
    attributes: ["id", "brandId", "email", "firstName", "lastName", "mobile"],
  });

  if (!user) {
    throw new AppError("User not found", 404);
  }

  if (!isSoundTrackingApp && !user.brandId) {
    throw new AppError("User is not associated with any brand", 400);
  }

  const brandId: number | null = isSoundTrackingApp ? null : user.brandId!;

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

  // Get owners for the track (used for PDF metadata; token matching is skipped for SOUND_TRACKING_APP)
  const ownerIds = track.ownerId || [];
  const owners = ownerIds.length > 0
    ? await OwnerModel.findAll({
        where: { id: { [Op.in]: ownerIds } },
        attributes: ["id", "type"],
      })
    : [];

  let matchingTokenType: string | null = null;
  let matchingOwnerId: string | null = null;

  if (!isSoundTrackingApp) {
    if (ownerIds.length === 0) {
      throw new AppError("Track has no owners assigned", 400);
    }

    // Find a valid token for any owner of the track (token_assigned table)
    for (const owner of owners) {
      const ownerType = owner.type;
      if (!ownerType) continue;

      const validToken = await findValidTokenAssignedForOwner(
        brandId!,
        ownerType,
        owner.id,
        TOKEN_COST_PER_LICENSE,
      );

      if (validToken) {
        matchingTokenType = ownerType;
        matchingOwnerId = owner.id;
        break;
      }
    }

    if (!matchingTokenType || matchingOwnerId === null) {
      throw new AppError(
        `You don't have enough credits to license this track. Please contact your administrator to top up your credits.`,
        400,
      );
    }
  }

  // Generate GCS signed URL for the track
  const gcsResult = await generateGCSSignedUrl({ trackId: track.id });

  // Create license record. brandId is null for SOUND_TRACKING_APP (no brand association).
  const licenseDetails: LicenseDetails = {
    brandId,
    userId,
    trackCode: track.trackCode,
    tokenCost: isSoundTrackingApp ? 0 : TOKEN_COST_PER_LICENSE,
    licensedAt: new Date(),
    createdAt: new Date(),
    campaignId: campaignIdToApply ?? null,
  };

  const createdLicense = await createLicenseRecord(licenseDetails);

  // Token deduction is skipped entirely for SOUND_TRACKING_APP.
  let remainingTokens = 0;
  let deductionWasUnlimited = false;
  if (!isSoundTrackingApp) {
    const deduction = await deductTokenAssignedByType(
      brandId!,
      matchingTokenType!,
      TOKEN_COST_PER_LICENSE,
      matchingOwnerId!,
      TokenDeductionReason.LICENSE_PURCHASE,
      createdLicense.id,
    );

    if (!deduction.success) {
      throw new AppError(
        "Failed to process token deduction. Insufficient tokens.",
        400,
      );
    }

    remainingTokens = deduction.remainingTokens;
    deductionWasUnlimited = deduction.isUnlimited === true;

    if (deduction.tokenAssignedId) {
      await LicenseModel.update(
        { tokenId: deduction.tokenAssignedId },
        { where: { id: createdLicense.id } },
      );
    }
  }

  // Generate and store license PDF asynchronously
  (async () => {
    try {
      // Get owner username for the PDF
      let ownerName = "";
      if (owners.length > 0 && owners[0].username) {
        ownerName = (owners[0] as any).username || "";
      } else if (ownerIds.length > 0) {
        const ownerWithUsername = await OwnerModel.findByPk(ownerIds[0], {
          attributes: ["id", "username"],
        });
        ownerName = ownerWithUsername?.username || "";
      }

      // Format date as DD/MM/YYYY
      const licensedDate = new Date();
      const formattedDate = `${String(licensedDate.getDate()).padStart(2, "0")}/${String(licensedDate.getMonth() + 1).padStart(2, "0")}/${licensedDate.getFullYear()}`;

      // Generate PDF
      const pdfBuffer = await generateLicensePdf({
        name: [user.firstName, user.lastName].filter(Boolean).join(" "),
        email: user.email || "",
        mobile: user.mobile || "",
        date: formattedDate,
        trackName: track.name || "",
        ownerName,
        licenseId: createdLicense.id!,
      });

      // Upload to GCS
      const gcsPath = `licenses-pdf/${createdLicense.id}/license-agreement.pdf`;
      await uploadBufferToGCS({
        buffer: pdfBuffer,
        gcsPath,
        contentType: "application/pdf",
      });

      // Update license record with the PDF path
      await LicenseModel.update(
        { licensePdfPath: gcsPath },
        { where: { id: createdLicense.id } },
      );

      logger.info("License PDF generated and stored successfully", {
        licenseId: createdLicense.id,
        gcsPath,
      });
    } catch (err: any) {
      logger.error("Failed to generate and store license PDF", {
        licenseId: createdLicense.id,
        error: err.message,
      });
    }
  })();

  const downloadedByFullName = [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email || "";

  if (isSoundTrackingApp) {
    // SOUND_TRACKING_APP: notify only the licensing user (no brand team, no low-credit alerts).
    if (user.email) {
      sendTrackDownloadNotificationEmail(user.email, {
        recipientFirstName: user.firstName || "",
        trackName: track.name || trackCode,
        assortmentType: "",
        creditsRemaining: 0,
        downloadedByFullName,
      }).catch((err) => {
        logger.error("Failed to send track download notification email", {
          recipientEmail: user.email,
          error: err.message,
        });
      });
    }
  } else {
    // For unlimited allocations there is no meaningful "credits remaining" number;
    // surface 0 in the email payload (the FE/template should treat unlimited rows
    // separately) and never trigger low-credits alerts.
    const creditsRemainingForEmail = deductionWasUnlimited ? 0 : remainingTokens;

    // Notify entire brand team about the track download
    findAllActiveUsersByBrandId(brandId!)
      .then((teamMembers) => {
        teamMembers.forEach((member) => {
          if (member.email) {
            sendTrackDownloadNotificationEmail(member.email, {
              recipientFirstName: member.firstName || "",
              trackName: track.name || trackCode,
              assortmentType: matchingTokenType!,
              creditsRemaining: creditsRemainingForEmail,
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

    // Send low credits alert to whole team if remaining tokens drop below 2.
    // Skip for unlimited allocations — they never run out.
    if (!deductionWasUnlimited && remainingTokens < 2) {
      findAllActiveUsersByBrandId(brandId!)
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
  }

  return {
    id: createdLicense.id!,
    downloadLink: gcsResult.downloadLink,
    // Unlimited allocations don't have a meaningful balance — return 0 with the
    // unlimitedTokens flag so the FE can render "Unlimited" without leaking the
    // MAX_SAFE_INTEGER sentinel from the persistence layer.
    remainingTokens: deductionWasUnlimited ? 0 : remainingTokens,
    unlimitedTokens: deductionWasUnlimited || undefined,
    trackId: track.id,
    trackName: track.name,
    campaignId: campaignIdToApply ?? null,
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

  // Using NEW token_assigned table
  const tokens = await getAllTokenAssignedBalances(user.brandId);

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
  ownerIds?: string[];
}

export interface AssignTokensByTypeResponse {
  brandId: number;
  type: string;
  tokenBalance: number;
  totalAssignedToken: number;
  expiryDate?: Date;
  ownerIds?: string[];
}

export const assignTokensService = async (
  brandId: number,
  tokens: number,
  type: string,
  expiryDate?: Date,
  ownerIds?: string[],
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

  // Using NEW token_assigned table
  const createdToken = await addTokensAssignedByType(brandId, type, tokens, expiryDate, ownerIds);

  return {
    brandId,
    type: createdToken.type,
    tokenBalance: createdToken.tokenBalance,
    totalAssignedToken: createdToken.totalAssignedToken,
    expiryDate: createdToken.expiryDate,
    ownerIds: createdToken.ownerIds,
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

  // Use stored PDF path from database, or fallback to computed path for legacy licenses
  const gcsPath = license.licensePdfPath || `licenses-pdf/${licenseId}/license-agreement.pdf`;

  // Try to get existing PDF from bucket first
  const existingPdfUrl = await getGCSSignedUrl({
    gcsPath,
    contentType: "application/pdf",
  });

  if (existingPdfUrl) {
    return { downloadLink: existingPdfUrl };
  }

  // PDF not found in bucket (legacy license), generate and upload it
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
    licenseId,
  });

  // Upload to GCS
  const downloadLink = await uploadBufferToGCS({
    buffer: pdfBuffer,
    gcsPath,
    contentType: "application/pdf",
  });

  // Store the PDF path in database for future lookups
  await LicenseModel.update(
    { licensePdfPath: gcsPath },
    { where: { id: licenseId } },
  );

  return { downloadLink };
};

export interface OwnerWiseTokenBreakdown {
  ownerIds: string[];
  ownerDetails: { id: string; name: string }[];
  totalAssignedToken: number;
  tokensUsed: number;
  tokenBalance: number;
  expiryDate?: Date;
  isUnlimited?: boolean;
}

export interface TokenDetailsItem {
  totalAssignedToken: number;
  tokensUsed: number;
  tokenBalance: number;
  type: string;
  isUnlimited?: boolean;
  ownerWiseBreakdown?: OwnerWiseTokenBreakdown[];
}

export interface TokenDetailsResponse {
  brandId: number;
  tokens: TokenDetailsItem[];
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

  // Using NEW token_assigned table
  const [tokens, allTokenTypes] = await Promise.all([
    getAllTokenAssignedDetails(user.brandId),
    getDistinctTokenAssignedTypes(),
  ]);

  // Collect all unique owner IDs to fetch their details in a single query
  const allOwnerIds = new Set<string>();
  for (const token of tokens) {
    if (token.ownerIds && Array.isArray(token.ownerIds)) {
      for (const ownerId of token.ownerIds) {
        allOwnerIds.add(ownerId);
      }
    }
  }

  // Fetch all owner details in one batch query
  const ownerDetailsList = await getOwnersByIds(Array.from(allOwnerIds));
  const ownerDetailsMap = new Map(ownerDetailsList.map((o) => [o.id, o]));

  // Aggregate tokens by type and also collect owner-wise breakdown.
  // Once a type has any unlimited allocation, the rolled-up totals are no longer
  // meaningful — we mark the type as unlimited and stop summing finite numbers
  // into it. The FE should render "Unlimited" instead of a balance figure.
  const aggregatedTokenMap = new Map<string, {
    totalAssignedToken: number;
    tokenBalance: number;
    isUnlimited: boolean;
    ownerWiseBreakdown: OwnerWiseTokenBreakdown[];
  }>();

  for (const token of tokens) {
    const existing = aggregatedTokenMap.get(token.type);
    const tokenOwnerIds = token.ownerIds || [];
    const ownerDetails = tokenOwnerIds.map((id: string) => ownerDetailsMap.get(id) || { id, name: "" });
    const tokenIsUnlimited = token.isUnlimited === true;

    const breakdown: OwnerWiseTokenBreakdown = {
      ownerIds: tokenOwnerIds,
      ownerDetails,
      totalAssignedToken: token.totalAssignedToken,
      tokensUsed: tokenIsUnlimited ? 0 : token.totalAssignedToken - token.tokenBalance,
      tokenBalance: token.tokenBalance,
      expiryDate: token.expiryDate,
      isUnlimited: tokenIsUnlimited,
    };

    if (existing) {
      if (tokenIsUnlimited) {
        existing.isUnlimited = true;
      } else if (!existing.isUnlimited) {
        existing.totalAssignedToken += token.totalAssignedToken;
        existing.tokenBalance += token.tokenBalance;
      }
      existing.ownerWiseBreakdown.push(breakdown);
    } else {
      aggregatedTokenMap.set(token.type, {
        totalAssignedToken: tokenIsUnlimited ? 0 : token.totalAssignedToken,
        tokenBalance: tokenIsUnlimited ? 0 : token.tokenBalance,
        isUnlimited: tokenIsUnlimited,
        ownerWiseBreakdown: [breakdown],
      });
    }
  }

  const ASSORTMENT_ORDER: Record<string, number> = {
    chartbusters: 1,
    international: 2,
    "regional & indie": 3,
    "hoopr originals": 4,
  };

  // Merge breakdowns that share the same set of owners (order-insensitive).
  // Multiple token rows can target the same owner set; the FE wants one row per
  // owner-set in the response, so we sum totals and drop expiryDate (sources
  // may have differing expiries and a single date would be misleading).
  const mergeBreakdownsByOwnerSet = (
    breakdowns: OwnerWiseTokenBreakdown[],
  ): OwnerWiseTokenBreakdown[] => {
    const grouped = new Map<string, OwnerWiseTokenBreakdown>();
    for (const b of breakdowns) {
      const key = [...b.ownerIds].sort().join("|");
      const existing = grouped.get(key);
      if (!existing) {
        const { expiryDate: _drop, ...rest } = b;
        grouped.set(key, { ...rest });
        continue;
      }
      if (b.isUnlimited) {
        existing.isUnlimited = true;
        existing.totalAssignedToken = 0;
        existing.tokensUsed = 0;
        existing.tokenBalance = 0;
      } else if (!existing.isUnlimited) {
        existing.totalAssignedToken += b.totalAssignedToken;
        existing.tokensUsed += b.tokensUsed;
        existing.tokenBalance += b.tokenBalance;
      }
    }
    return Array.from(grouped.values());
  };

  const mergedTokens = allTokenTypes
    .map((type) => {
      const token = aggregatedTokenMap.get(type);
      const isChartbusters = type.toLowerCase() === "chartbusters";

      if (token) {
        return {
          totalAssignedToken: token.totalAssignedToken,
          tokensUsed: token.isUnlimited ? 0 : token.totalAssignedToken - token.tokenBalance,
          tokenBalance: token.tokenBalance,
          type,
          isUnlimited: token.isUnlimited,
          // Only include ownerWiseBreakdown for Chartbusters type
          ...(isChartbusters && {
            ownerWiseBreakdown: mergeBreakdownsByOwnerSet(token.ownerWiseBreakdown),
          }),
        };
      }
      return {
        totalAssignedToken: 0,
        tokensUsed: 0,
        tokenBalance: 0,
        type,
        isUnlimited: false,
        ...(isChartbusters && { ownerWiseBreakdown: [] }),
      };
    })
    .sort((a, b) => {
      const rankA = ASSORTMENT_ORDER[a.type.toLowerCase()] ?? 999;
      const rankB = ASSORTMENT_ORDER[b.type.toLowerCase()] ?? 999;
      return rankA - rankB;
    });

  return {
    brandId: user.brandId,
    tokens: mergedTokens,
  };
};

export interface MissingVideoLinksResponse {
  missingVideoLinksCount: number;
  missingLink: boolean;
}

export const getMissingVideoLinksService = async (
  userId: number,
): Promise<MissingVideoLinksResponse> => {
  const user = await UserModel.findByPk(userId, {
    attributes: ["id", "brandId"],
  });

  if (!user) {
    throw new AppError("User not found", 404);
  }

  if (!user.brandId) {
    throw new AppError("User is not associated with any brand", 400);
  }

  const missingVideoLinksCount = await countLicensesWithMissingVideoLinks(user.brandId);

  return {
    missingVideoLinksCount,
    missingLink: missingVideoLinksCount > 0,
  };
};
