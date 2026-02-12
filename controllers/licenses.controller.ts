import type { Request, Response } from "express";
import {
  licenseTrackService,
  getTokenBalanceService,
  assignTokensService,
  getBrandLicenseHistoryService,
  downloadTrackService,
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
import { LicenseModel, VideoLinkType } from "../services/persistence-service/exports";

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
  const { brandId, tokens } = req.body;

  if (!brandId || tokens === undefined) {
    return sendError(res, HttpStatusCode.BAD_REQUEST, "Brand ID and tokens are required", {});
  }

  const response = await assignTokensService(brandId, tokens);
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

export const addVideoLink = catchAsync(async (req: AuthRequest, res: Response) => {
  const userId = req.session?.userId;
  if (!userId) {
    return sendError(res, HttpStatusCode.UNAUTHORIZED, "Unauthorized", {});
  }

  const { licenseId, videoLinks } = req.body;

  if (!licenseId) {
    return sendError(res, HttpStatusCode.BAD_REQUEST, "License ID is required", {});
  }

  if (!videoLinks || !Array.isArray(videoLinks) || videoLinks.length === 0) {
    return sendError(res, HttpStatusCode.BAD_REQUEST, "videoLinks array is required and must not be empty", {});
  }

  if (videoLinks.length > 3) {
    return sendError(res, HttpStatusCode.BAD_REQUEST, "Maximum 3 video links can be added at a time", {});
  }

  const validTypes = Object.values(VideoLinkType);
  for (const link of videoLinks) {
    if (!link.url || !link.type) {
      return sendError(res, HttpStatusCode.BAD_REQUEST, "Each video link must have url and type", {});
    }
    if (!validTypes.includes(link.type)) {
      return sendError(
        res,
        HttpStatusCode.BAD_REQUEST,
        `Invalid video link type: ${link.type}. Must be one of: ${validTypes.join(", ")}`,
        {}
      );
    }
  }

  // Check for duplicate types in the request
  const types = videoLinks.map((link: { type: string }) => link.type);
  const uniqueTypes = new Set(types);
  if (uniqueTypes.size !== types.length) {
    return sendError(
      res,
      HttpStatusCode.BAD_REQUEST,
      "Duplicate video link types are not allowed. Each type can only be added once.",
      {}
    );
  }

  // Get track code from license details
  const licenseDetails = await LicenseModel.findByPk(licenseId);
  if (!licenseDetails) {
    return sendError(res, HttpStatusCode.NOT_FOUND, "License not found", {});
  }
  const trackCode = licenseDetails.trackCode;

  const response = await addVideoLinkService(userId, {
    licenseId,
    videoLinks,
    trackCode,
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