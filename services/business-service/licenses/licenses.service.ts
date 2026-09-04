import {
  createLicenseRecord,
  getBrandDownloadsPage,
  getLicensesByIds,
  type LicenseSort,
  LicenseModel,
  VideoLinkModel,
  type LicenseDetails,
  type LicenseHistoryCategory,
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
  findBestTokenAssignedForTrackOwners,
  TokenDeductionReason,
} from "../../persistence-service/token/modules.export";
import { TrackModel } from "../../persistence-service/track/modules.export";
import {
  earliestPublishedDate,
  publishedExpiry,
  expiryStatusOf,
  daysLeftUntil,
  isLicenseExpiryStatus,
  STATUS_NOT_APPLICABLE,
  REQUIRED_VIDEO_LINKS,
  EXPIRING_SOON_DAYS,
  PUBLISHED_TERM_YEARS,
  type LicenseExpiryStatus,
} from "./publishedTerm";
import { UserModel, findAllActiveUsersByBrandId } from "../../persistence-service/user/modules.export";
import { OwnerModel, getOwnersByIds } from "../../persistence-service/owner/modules.export";
import { CampaignModel, CampaignStatus } from "../../persistence-service/campaign/modules.export";
import { Op, literal } from "sequelize";
import {
  AppError,
  generateGCSSignedUrl,
  getGCSObjectWithMetadata,
  uploadBufferToGCS,
  getGCSSignedUrl,
  generateLicensePdf,
  buildLicensePdfGcsPath,
  sendTrackDownloadNotificationEmail,
  sendLowCreditsAlertEmail,
} from "../../helper-service/modules.export";
import { logger } from "../../helper-service/logger";
import { findMixByLicenseId } from "../../persistence-service/track/mixer.persistence.service";
import {
  buildStemBundle,
  readCachedStemBundle,
  type StemBundleInput,
} from "../../helper-service/stem-bundle.helper";
import {
  getStemBundleQueue,
  stemBundleJobId,
} from "../../scheduler-service/queues/stem-bundle.queue";
import { getStemsForTrackId, toBundleStems } from "../track/stem.service";
import type {
  LicenseTrackRequest,
  LicenseResponse,
  BrandLicenseHistoryResponse,
  BrandLicenseHistoryItem,
  DownloadTrackRequest,
  DownloadTrackResponse,
  DownloadTrackResult,
} from "../../dto-service/licenses/modules.export";
import { Platform, isPlatform, isSfxTrackType } from "../../dto-service/modules.export";

const TOKEN_COST_PER_LICENSE = 1;

export const licenseTrackService = async (
  userId: number,
  data: LicenseTrackRequest,
  platform?: Platform,
): Promise<LicenseResponse> => {
  const { trackCode, campaignId: requestedCampaignId } = data;
  const isCreator = isPlatform(platform, Platform.CREATOR);

  // campaignId is only honored for CREATOR. Defense-in-depth: even if a
  // non-CREATOR request slips one in via the service layer, we drop it.
  const campaignIdToApply = isCreator ? requestedCampaignId : undefined;

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

  // Get user (brand only required for non-CREATOR platforms).
  // countryCode + profileRole are needed by the isProfileComplete getter —
  // it's computed from columns, not a column itself.
  const user = await UserModel.findByPk(userId, {
    attributes: ["id", "brandId", "email", "firstName", "lastName", "mobile", "countryCode", "profileRole"],
  });

  if (!user) {
    throw new AppError("User not found", 404);
  }

  if (!isCreator && !user.brandId) {
    throw new AppError("User is not associated with any brand", 400);
  }

  const brandId: number | null = isCreator ? null : user.brandId!;

  // Get track details including ownerId
  const track = await TrackModel.findOne({
    where: { trackCode },
    attributes: ["id", "trackCode", "name", "ownerId", "mp3Link", "type"],
  });
  if (!track) {
    throw new AppError("Track not found", 404);
  }

  // SFX tracks are free to download — no tokens deducted, no price — but the
  // user must have a completed profile.
  const isSfxTrack = isSfxTrackType(track.type);

  // SFX audio lives in the stream-source bucket (no mp3Link on the track row);
  // generateGCSSignedUrl verifies the file exists there before signing.
  if (!isSfxTrack && !track.mp3Link) {
    throw new AppError("Track audio file is not available for download", 400);
  }
  if (isSfxTrack && !user.isProfileComplete) {
    throw new AppError(
      "Please complete your profile to download SFX tracks",
      403,
      "PROFILE_INCOMPLETE",
    );
  }

  // Tokens are skipped for CREATOR (always free) and for SFX tracks.
  const skipTokens = isCreator || isSfxTrack;

  // Get owners for the track (used for PDF metadata; token matching is skipped for CREATOR)
  const ownerIds = track.ownerId || [];
  const owners = ownerIds.length > 0
    ? await OwnerModel.findAll({
        where: { id: { [Op.in]: ownerIds } },
        attributes: ["id", "type"],
      })
    : [];

  let matchingTokenType: string | null = null;
  let matchingOwnerId: string | null = null;

  if (!skipTokens) {
    if (ownerIds.length === 0) {
      throw new AppError("Track has no owners assigned", 400);
    }

    // Evaluate every (ownerId, ownerType) pair on the track together so the
    // ranking (owner-assigned-finite > generic-finite > unlimited, oldest within
    // each tier) holds globally — not just within whichever track owner happened
    // to be iterated first.
    const trackOwnersForLookup = owners
      .filter((o) => !!o.type)
      .map((o) => ({ ownerId: o.id, type: o.type as string }));

    const bestMatch = await findBestTokenAssignedForTrackOwners(
      brandId!,
      trackOwnersForLookup,
      TOKEN_COST_PER_LICENSE,
    );

    if (!bestMatch) {
      throw new AppError(
        `You don't have enough credits to license this track. Please contact your administrator to top up your credits.`,
        400,
      );
    }

    matchingTokenType = bestMatch.matchedType;
    matchingOwnerId = bestMatch.matchedOwnerId;
  }

  // Generate GCS signed URL for the track
  const gcsResult = await generateGCSSignedUrl({ trackId: track.id, isSfx: isSfxTrack });

  // Create license record. brandId is null for CREATOR (no brand association).
  const now = new Date();
  const validThrough = new Date(now);
  validThrough.setFullYear(validThrough.getFullYear() + 1);
  const licenseDetails: LicenseDetails = {
    brandId,
    userId,
    trackCode: track.trackCode,
    tokenCost: skipTokens ? 0 : TOKEN_COST_PER_LICENSE,
    licensedAt: now,
    validThrough,
    createdAt: now,
    campaignId: campaignIdToApply ?? null,
    ...(isSfxTrack && { type: "sfx_free", price: 0 }),
  };

  const createdLicense = await createLicenseRecord(licenseDetails);

  // Token deduction is skipped entirely for CREATOR and SFX tracks.
  let remainingTokens = 0;
  let deductionWasUnlimited = false;
  if (!skipTokens) {
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

      // Brands on a custom license template are addressed by brand name.
      let brandName = "";
      if (brandId) {
        const brand = await findBrandById(brandId);
        brandName = brand?.name || "";
      }

      // Generate PDF
      const pdfBuffer = await generateLicensePdf({
        name: [user.firstName, user.lastName].filter(Boolean).join(" "),
        email: user.email || "",
        mobile: user.mobile || "",
        date: formattedDate,
        trackName: track.name || "",
        ownerName,
        licenseId: createdLicense.id!,
        brandId,
        brandName,
      });

      // Upload to GCS
      const gcsPath = buildLicensePdfGcsPath(createdLicense.id!, brandId);
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

  if (skipTokens) {
    // CREATOR + free SFX downloads: notify only the licensing user
    // (no brand team, no low-credit alerts — no credits were consumed).
    if (user.email) {
      sendTrackDownloadNotificationEmail(user.email, {
        recipientFirstName: user.firstName || "",
        trackName: track.name || trackCode,
        assortmentType: isSfxTrack ? "SFX" : "",
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
    validThrough: licenseDetails.validThrough!,
    campaignId: campaignIdToApply ?? null,
    // Free SFX download — no tokens were deducted; FE can skip token-balance refresh.
    ...(isSfxTrack && { isSfx: true, freeDownload: true }),
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
  category?: LicenseHistoryCategory,
  status?: LicenseExpiryStatus,
  sort: LicenseSort = "expiring-first",
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

  // Which licences, in what order, and how big every bucket is — all decided in
  // SQL, because none of it can be worked out from a single page of rows. The
  // ids come back already ordered; getLicensesByIds only hydrates them.
  const { ids, totalItems, counts, derived } = await getBrandDownloadsPage(brandId, {
    page,
    limit,
    category,
    status,
    sort,
    termYears: PUBLISHED_TERM_YEARS,
    requiredLinks: REQUIRED_VIDEO_LINKS,
    soonDays: EXPIRING_SOON_DAYS,
  });
  const rows = await getLicensesByIds(ids);
  const count = totalItems;

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
    const licensePublishedAt = earliestPublishedDate(videoLinks);

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
      validThrough: license.validThrough ?? null,
      purchasedDate: license.createdAt,
      userId: license.userId,
      userEmail: licenseUser?.email,
      publishedDate: licensePublishedAt,
      publishedExpiryDate: publishedExpiry(licensePublishedAt),
      // Taken from the SQL pass that produced the counts, so a row can never
      // contradict the chip it was counted under. expiryStatusOf is the same
      // rule and only stands in if a row somehow arrived without one.
      //
      // SFX surface as null, not as the internal STATUS_NOT_APPLICABLE marker:
      // the absence of a status is the fact, and inventing a sixth value would
      // make every client switch on a bucket that has no chip.
      expiryStatus: (() => {
        const d = derived.get(Number(license.id));
        if (d) {
          return d.status === STATUS_NOT_APPLICABLE
            ? null
            : (d.status as LicenseExpiryStatus);
        }
        return expiryStatusOf(
          licensePublishedAt,
          videoLinks?.length ?? 0,
          new Date(),
          isSfxTrackType(track?.type),
        );
      })(),
      daysLeft: daysLeftUntil(licensePublishedAt),
      requiredVideoLinks: isSfxTrackType(track?.type) ? 0 : REQUIRED_VIDEO_LINKS,
      videoLinks: videoLinks?.map((vl) => ({
        id: vl.id,
        url: vl.url,
        status: vl.status,
        trackCode: vl.trackCode,
        createdAt: vl.createdAt,
        publishedDate: vl.reelPostedAt ?? null,
        publishedExpiryDate: publishedExpiry(vl.reelPostedAt),
      })),
      ownerType: ownerTypes.length > 0 ? ownerTypes[0] : undefined,
      ownerSubType: ownerSubTypes.length > 0 ? ownerSubTypes[0] : undefined,
      primaryArtists,
      type: license.type,
      price: license.price,
      ...(isSfxTrackType(track?.type) && { isSfx: true, freeDownload: true }),
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
    counts,
    applied: { category: category ?? null, status: status ?? null, sort },
  };
};

export const downloadTrackService = async (
  userId: number,
  data: DownloadTrackRequest,
): Promise<DownloadTrackResult> => {
  const { licenseId, includeStems } = data;

  // Get license details
  const license = await LicenseModel.findByPk(licenseId, {
    include: [TrackModel],
  });

  if (!license) {
    throw new AppError("License not found", 404);
  }

  // Verify ownership — Number() cast handles Sequelize returning BIGINT as string
  if (Number(license.userId) !== userId) {
    // Or check if the user belongs to the brand that owns the license
    const user = await UserModel.findByPk(userId);
    if (!user || !user.brandId || Number(user.brandId) !== Number(license.brandId)) {
      throw new AppError("Unauthorized access to license", 403);
    }
  }

  const track = license.track;
  if (!track) {
    throw new AppError("Track associated with license not found", 404);
  }

  // A MIX licence resolves to the rendered mix, not to the track master.
  //
  // Checked before the mp3Link guard below on purpose: a mix is an object this
  // service wrote into SELECT_BUCKET, so whether the CATALOGUE row has an
  // mp3Link says nothing about whether the mix is downloadable — and the guard
  // would reject a perfectly good mix of a track whose master link is missing.
  //
  // The mix is signed with its own stored filename so the browser saves
  // "<Track>_<stems>.wav" rather than the track's name, and `includeStems` is
  // ignored: a mix IS a combination of stems, and the stem bundle is a
  // different deliverable the brand can ask for against a track licence.
  if ((license.type ?? "").toLowerCase() === "mix") {
    const mix = await findMixByLicenseId(license.id);
    if (!mix?.gcsPath) {
      throw new AppError("Mix file is no longer available.", 404);
    }
    const format = mix.format ?? "wav";
    const signed = await getGCSObjectWithMetadata({
      gcsPath: mix.gcsPath,
      contentType: format === "mp3" ? "audio/mpeg" : "audio/wav",
      downloadName: mix.fileName ?? `mix.${format}`,
    });
    if (!signed) {
      throw new AppError("Mix file is no longer available.", 404);
    }
    return {
      status: "ready",
      downloadLink: signed.downloadLink,
      trackId: track.id,
      trackName: track.name || "",
      sizeBytes: signed.sizeBytes,
    };
  }

  // SFX audio lives in the stream-source bucket and has no mp3Link on the track row
  const isSfxTrack = isSfxTrackType(track.type);
  if (!isSfxTrack && !track.mp3Link) {
    throw new AppError("Track audio file is not available for download", 400);
  }

  // Stems ride the licence the brand has already paid for — no extra token is
  // deducted here, and no separate licence row is written. This endpoint is
  // reached only after licenseTrackService has charged for the track.
  if (includeStems) {
    return requestStemBundle(track.id, track.name || "", isSfxTrack);
  }

  // Generate GCS signed URL for the track
  const gcsResult = await generateGCSSignedUrl({ trackId: track.id, isSfx: isSfxTrack });

  return {
    status: "ready",
    downloadLink: gcsResult.downloadLink,
    trackId: track.id,
    trackName: track.name || "",
  };
};

/** How long the client is told to wait before polling the bundle again. */
const BUNDLE_RETRY_AFTER_MS = 1500;

/**
 * Answer for the "mix + stems" zip: the cached bundle if it exists, otherwise a
 * "preparing" that the client polls on.
 *
 * A track with no stem rows still produces a zip (holding just the mix) rather
 * than a bare mp3. The client has already committed to saving the response as
 * `.zip` by the time it calls, so handing back an mp3 would save a file that no
 * archiver can open. In practice this only happens if a stem is soft-deleted
 * between the list response and the download.
 */
const requestStemBundle = async (
  trackId: string,
  trackName: string,
  isSfx: boolean,
): Promise<DownloadTrackResult> => {
  const stems = await getStemsForTrackId(trackId);
  const input: StemBundleInput = {
    trackId,
    trackName,
    isSfx,
    stems: toBundleStems(stems),
  };

  const cached = await readCachedStemBundle(input);
  if (cached) {
    return {
      status: "ready",
      downloadLink: cached.downloadLink,
      trackId,
      trackName,
      fileCount: cached.fileCount,
      sizeBytes: cached.sizeBytes,
    };
  }

  const jobId = stemBundleJobId(trackId);

  try {
    const bundleQueue = getStemBundleQueue();
    const existing = await bundleQueue.getJob(jobId);

    if (existing) {
      const state = await existing.getState();
      if (state === "failed") {
        // Without this the client polls "preparing" until its own timeout, and
        // the dead job blocks every future attempt because the id is taken.
        const reason = existing.failedReason;
        await existing.remove();
        logger.error(
          `[StemBundle] Build for track ${trackId} failed: ${reason}`,
        );
        throw new AppError(
          "This track's stems could not be packaged for download.",
          400,
        );
      }
      // Queued or running — someone else is already building it.
      return { status: "preparing", retryAfterMs: BUNDLE_RETRY_AFTER_MS };
    }

    await bundleQueue.add("build-bundle", input, { jobId });
    return { status: "preparing", retryAfterMs: BUNDLE_RETRY_AFTER_MS };
  } catch (error) {
    if (error instanceof AppError) throw error;

    // No Redis (SKIP_SCHEDULER=true locally, or the queue is unreachable).
    // Falling back to an in-request build keeps downloads working instead of
    // leaving the client polling a job nothing will ever pick up.
    logger.warn(
      `[StemBundle] Queue unavailable for track ${trackId}, building inline: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    try {
      const built = await buildStemBundle(input);
      return {
        status: "ready",
        downloadLink: built.downloadLink,
        trackId,
        trackName,
        fileCount: built.fileCount,
        sizeBytes: built.sizeBytes,
      };
    } catch (buildError) {
      logger.error(
        `[StemBundle] Inline build for track ${trackId} failed:`,
        buildError,
      );
      throw new AppError(
        "This track's stems could not be packaged for download.",
        400,
      );
    }
  }
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

  // Verify ownership — Number() cast handles Sequelize returning BIGINT as string
  if (Number(license.userId) !== userId) {
    const user = await UserModel.findByPk(userId);
    if (!user || !user.brandId || Number(user.brandId) !== Number(license.brandId)) {
      throw new AppError("Unauthorized access to license", 403);
    }
  }

  const track = license.track;
  if (!track) {
    throw new AppError("Track associated with license not found", 404);
  }

  // Path the PDF *should* live at for this license's brand. For brands on a
  // custom template this differs from the generic path, so any PDF stored
  // before the brand was onboarded is bypassed and re-rendered below.
  const expectedGcsPath = buildLicensePdfGcsPath(licenseId, license.brandId);
  const genericGcsPath = `licenses-pdf/${licenseId}/license-agreement.pdf`;
  const gcsPath =
    expectedGcsPath === genericGcsPath
      ? license.licensePdfPath || genericGcsPath
      : expectedGcsPath;

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

  // Brands on a custom license template are addressed by brand name.
  let brandName = "";
  if (license.brandId) {
    const brand = await findBrandById(Number(license.brandId));
    brandName = brand?.name || "";
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
    brandId: license.brandId,
    brandName,
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
    return { brandId: 0, tokens: [] };
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

  // Sentinel value the FE expects when a token allocation is unlimited.
  // Sent in place of real totals so the UI can render a fixed "9999" without
  // a separate unlimited flag check in every consumer.
  const UNLIMITED_TOKEN_DISPLAY = 9999;

  for (const token of tokens) {
    const existing = aggregatedTokenMap.get(token.type);
    const tokenOwnerIds = token.ownerIds || [];
    const ownerDetails = tokenOwnerIds.map((id: string) => ownerDetailsMap.get(id) || { id, name: "" });
    const tokenIsUnlimited = token.isUnlimited === true;

    const breakdown: OwnerWiseTokenBreakdown = {
      ownerIds: tokenOwnerIds,
      ownerDetails,
      totalAssignedToken: tokenIsUnlimited ? UNLIMITED_TOKEN_DISPLAY : token.totalAssignedToken,
      tokensUsed: tokenIsUnlimited ? 0 : token.totalAssignedToken - token.tokenBalance,
      tokenBalance: tokenIsUnlimited ? UNLIMITED_TOKEN_DISPLAY : token.tokenBalance,
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
        existing.totalAssignedToken = UNLIMITED_TOKEN_DISPLAY;
        existing.tokensUsed = 0;
        existing.tokenBalance = UNLIMITED_TOKEN_DISPLAY;
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
        const mergeBreakdownsByOwner =  mergeBreakdownsByOwnerSet(token.ownerWiseBreakdown)
        return {
          totalAssignedToken: token.isUnlimited ? UNLIMITED_TOKEN_DISPLAY : token.totalAssignedToken,
          tokensUsed: token.isUnlimited ? 0 : token.totalAssignedToken - token.tokenBalance,
          tokenBalance: token.isUnlimited ? UNLIMITED_TOKEN_DISPLAY : token.tokenBalance,
          type,
          isUnlimited: token.isUnlimited,
          // Only include ownerWiseBreakdown for Chartbusters type
          ...(isChartbusters && ( mergeBreakdownsByOwner.length > 1 || mergeBreakdownsByOwner.length == 1 && mergeBreakdownsByOwner[0].ownerIds.length > 0 ) && { ownerWiseBreakdown: mergeBreakdownsByOwnerSet(token.ownerWiseBreakdown) }),
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
    return { missingVideoLinksCount: 0, missingLink: false };
  }

  const missingVideoLinksCount = await countLicensesWithMissingVideoLinks(user.brandId);

  return {
    missingVideoLinksCount,
    missingLink: missingVideoLinksCount > 0,
  };
};
