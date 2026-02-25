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
} from "../services/business-service/modules.export";
import {
  catchAsync,
  sendResponse,
  sendError,
} from "../services/helper-service/modules.export";
import { HttpStatusCode } from "../services/dto-service/modules.export";
import type { SessionPayload } from "../middlewares/authenticate";

interface AuthRequest extends Request {
  session?: SessionPayload;
}

export const licenseTrack = catchAsync(async (req: AuthRequest, res: Response) => {
  const userId = req.session?.userId;
  if (!userId) {
    return sendError(res, HttpStatusCode.UNAUTHORIZED, "Unauthorized", {});
  }
  const trackCode = req.params.trackCode as string;
  const response = await licenseTrackService(userId, {
    trackCode: trackCode,
  });
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
  const { brandId, tokens, type, expiryDate } = req.body;

  if (!brandId || tokens === undefined) {
    return sendError(res, HttpStatusCode.BAD_REQUEST, "Brand ID and tokens are required", {});
  }

  if (!type || typeof type !== "string" || type.trim().length === 0) {
    return sendError(res, HttpStatusCode.BAD_REQUEST, "Token type is required", {});
  }

  const response = await assignTokensService(brandId, tokens, type, expiryDate ? new Date(expiryDate) : undefined);
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

  const response = await getBrandLicenseHistoryService(userId, page, limit);
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

  const { licenseId } = req.body;

  if (!licenseId) {
    return sendError(res, HttpStatusCode.BAD_REQUEST, "License ID is required", {});
  }

  const response = await downloadTrackService(userId, {
    licenseId,
  });

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