import type { Request, Response } from "express";
import {
  licenseTrackService,
  getTokenBalanceService,
  assignTokensService,
  getBrandLicenseHistoryService,
  downloadTrackService,
  downloadLicensePdfService,
  addVideoLinkService,
  getVideoLinksService,
  getMissingVideoLinksService,
} from "../services/business-service/modules.export";
import {
  catchAsync,
  sendResponse,
  sendError,
} from "../services/helper-service/modules.export";
import { HttpStatusCode, Platform, isPlatform } from "../services/dto-service/modules.export";
import { isDownloadPending } from "../services/dto-service/licenses/modules.export";
import { ResponseMessages } from "../services/dto-service/constants/response-messages";
import type { SessionPayload } from "../middlewares/authenticate";
import {
  isLicenseExpiryStatus,
  LICENSE_EXPIRY_STATUSES,
  isLicenseSort,
  LICENSE_SORTS,
  type LicenseExpiryStatus,
  type LicenseSort,
} from "../services/dto-service/licenses/licenses.dto";

interface AuthRequest extends Request {
  session?: SessionPayload;
}

export const licenseTrack = catchAsync(async (req: AuthRequest, res: Response) => {
  const userId = req.session?.userId;
  if (!userId) {
    return sendError(res, HttpStatusCode.UNAUTHORIZED, "Unauthorized", {});
  }
  const trackCode = req.params.trackCode as string;
  const platform = req.session?.platform;

  // campaignId is only honored for CREATOR; ignored on every other platform.
  let campaignId: number | undefined;
  if (isPlatform(platform, Platform.CREATOR) && req.body?.campaignId !== undefined) {
    const parsed = Number(req.body.campaignId);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      return sendError(res, HttpStatusCode.BAD_REQUEST, "campaignId must be a positive integer", {});
    }
    campaignId = parsed;
  }

  const response = await licenseTrackService(userId, {
    trackCode: trackCode,
    campaignId,
  }, platform);
  sendResponse(res, {
    status: HttpStatusCode.OK,
    data: response,
    message: "Track license initiated successfully",
  });
});

export const getTokenBalance = catchAsync(async (req: AuthRequest, res: Response) => {
  const userId = req.session?.userId;
  if (!userId) {
    return sendError(res, HttpStatusCode.UNAUTHORIZED, "Unauthorized", {});
  }

  const response = await getTokenBalanceService(userId);
  sendResponse(res, {
    status: HttpStatusCode.OK,
    data: response,
    message: "Token balance retrieved successfully",
  });
});

export const assignTokens = catchAsync(async (req: AuthRequest, res: Response) => {
  const { brandId, tokens, type, expiryDate, ownerIds } = req.body;

  if (!brandId || tokens === undefined) {
    return sendError(res, HttpStatusCode.BAD_REQUEST, "Brand ID and tokens are required", {});
  }

  if (!type || typeof type !== "string" || type.trim().length === 0) {
    return sendError(res, HttpStatusCode.BAD_REQUEST, "Token type is required", {});
  }

  // Validate ownerIds if provided
  if (ownerIds !== undefined && !Array.isArray(ownerIds)) {
    return sendError(res, HttpStatusCode.BAD_REQUEST, "ownerIds must be an array", {});
  }

  const response = await assignTokensService(
    brandId,
    tokens,
    type,
    expiryDate ? new Date(expiryDate) : undefined,
    ownerIds,
  );
  sendResponse(res, {
    status: HttpStatusCode.OK,
    data: response,
    message: "Tokens assigned successfully",
  });
});

export const getBrandLicenseHistory = catchAsync(async (req: AuthRequest, res: Response) => {
  const userId = req.session?.userId;
  if (!userId) {
    return sendError(res, HttpStatusCode.UNAUTHORIZED, "Unauthorized", {});
  }

  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 10;

  // Optional content filter: 'tracks' (music) or 'sfx'. Omitted = all downloads.
  const rawCategory = req.query.category as string | undefined;
  let category: "tracks" | "sfx" | undefined;
  if (rawCategory !== undefined) {
    const normalized = rawCategory.toLowerCase();
    if (normalized !== "tracks" && normalized !== "sfx") {
      return sendError(
        res,
        HttpStatusCode.BAD_REQUEST,
        "Invalid category. Allowed values: tracks, sfx",
        {},
      );
    }
    category = normalized;
  }

  // Optional expiry-status filter. Rejected loudly rather than ignored: a
  // silently dropped filter returns a full, plausible-looking list, and the
  // caller cannot tell that from a bucket that genuinely holds everything.
  const rawStatus = req.query.status as string | undefined;
  let status: LicenseExpiryStatus | undefined;
  if (rawStatus !== undefined && rawStatus !== "") {
    if (!isLicenseExpiryStatus(rawStatus)) {
      return sendError(
        res,
        HttpStatusCode.BAD_REQUEST,
        `Invalid status. Allowed values: ${LICENSE_EXPIRY_STATUSES.join(", ")}`,
        {},
      );
    }
    status = rawStatus;
  }

  // Sort defaults to expiring-first — the screen exists to answer "what lapses
  // next", so that is the useful order before the user picks anything.
  const rawSort = req.query.sort as string | undefined;
  let sort: LicenseSort = "expiring-first";
  if (rawSort !== undefined && rawSort !== "") {
    if (!isLicenseSort(rawSort)) {
      return sendError(
        res,
        HttpStatusCode.BAD_REQUEST,
        `Invalid sort. Allowed values: ${LICENSE_SORTS.join(", ")}`,
        {},
      );
    }
    sort = rawSort;
  }

  const response = await getBrandLicenseHistoryService(
    userId,
    page,
    limit,
    category,
    status,
    sort,
  );
  sendResponse(res, {
    status: HttpStatusCode.OK,
    data: response,
    message: "Brand license history retrieved successfully",
  });
});

export const downloadTrack = catchAsync(async (req: AuthRequest, res: Response) => {
  const userId = req.session?.userId;
  if (!userId) {
    return sendError(res, HttpStatusCode.UNAUTHORIZED, "Unauthorized", {});
  }

  const { licenseId, includeStems } = req.body;

  if (!licenseId) {
    return sendError(res, HttpStatusCode.BAD_REQUEST, "License ID is required", {});
  }

  const response = await downloadTrackService(userId, {
    licenseId,
    includeStems: includeStems === true || includeStems === "true",
  });

  // 202 while the zip is still being built. The body still carries error.code 0
  // — this is a successful "not yet", not a failure — and the client polls
  // until a 200 with the link arrives.
  if (isDownloadPending(response)) {
    sendResponse(res, {
      status: HttpStatusCode.ACCEPTED,
      data: response,
      message: ResponseMessages.StemBundlePreparing,
    });
    return;
  }

  sendResponse(res, {
    status: HttpStatusCode.OK,
    data: response,
    message: "Track download link generated successfully",
  });
});

export const downloadLicensePdf = catchAsync(async (req: AuthRequest, res: Response) => {
  const userId = req.session?.userId;
  if (!userId) {
    return sendError(res, HttpStatusCode.UNAUTHORIZED, "Unauthorized", {});
  }

  const { licenseId } = req.body;

  if (!licenseId) {
    return sendError(res, HttpStatusCode.BAD_REQUEST, "License ID is required", {});
  }

  const response = await downloadLicensePdfService(userId, { licenseId });

  sendResponse(res, {
    status: HttpStatusCode.OK,
    data: response,
    message: "License PDF generated successfully",
  });
});

export const addVideoLink = catchAsync(async (req: AuthRequest, res: Response) => {
  const userId = req.session?.userId;
  if (!userId) {
    return sendError(res, HttpStatusCode.UNAUTHORIZED, "Unauthorized", {});
  }

  const { licenseId, trackCode, videoLinks } = req.body;

  if (!licenseId) {
    return sendError(res, HttpStatusCode.BAD_REQUEST, "License ID is required", {});
  }

  if (!trackCode) {
    return sendError(res, HttpStatusCode.BAD_REQUEST, "Track code is required", {});
  }

  if (!videoLinks || !Array.isArray(videoLinks) || videoLinks.length === 0) {
    return sendError(res, HttpStatusCode.BAD_REQUEST, "videoLinks array is required and must not be empty", {});
  }

  if (videoLinks.length > 3) {
    return sendError(res, HttpStatusCode.BAD_REQUEST, "Maximum 3 video links can be added at a time", {});
  }

  for (const link of videoLinks) {
    if (!link.url) {
      return sendError(res, HttpStatusCode.BAD_REQUEST, "Each video link must have a url", {});
    }
  }

  const response = await addVideoLinkService(userId, {
    licenseId,
    trackCode,
    videoLinks,
  });

  sendResponse(res, {
    status: HttpStatusCode.CREATED,
    data: response,
    message: videoLinks.length === 1 ? "Video link added successfully" : "Video links added successfully",
  });
});

export const getVideoLinks = catchAsync(async (req: AuthRequest, res: Response) => {
  const userId = req.session?.userId;
  if (!userId) {
    return sendError(res, HttpStatusCode.UNAUTHORIZED, "Unauthorized", {});
  }

  const licenseId = parseInt(req.params.licenseId as string);

  if (!licenseId || isNaN(licenseId)) {
    return sendError(res, HttpStatusCode.BAD_REQUEST, "Valid License ID is required", {});
  }

  const response = await getVideoLinksService(userId, licenseId);

  sendResponse(res, {
    status: HttpStatusCode.OK,
    data: response,
    message: "Video links retrieved successfully",
  });
});

export const getMissingVideoLinks = catchAsync(async (req: AuthRequest, res: Response) => {
  const userId = req.session?.userId;
  if (!userId) {
    return sendError(res, HttpStatusCode.UNAUTHORIZED, "Unauthorized", {});
  }

  const response = await getMissingVideoLinksService(userId);

  sendResponse(res, {
    status: HttpStatusCode.OK,
    data: response,
    message: "Missing video links count retrieved successfully",
  });
});