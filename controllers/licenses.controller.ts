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

  const { licenseId, url, trackCode } = req.body;

  if (!licenseId || !url) {
    return sendError(res, HttpStatusCode.BAD_REQUEST, "License ID and URL are required", {});
  }

  const response = await addVideoLinkService(userId, {
    licenseId,
    url,
    trackCode,
  });

  sendResponse(res, {
    status: HttpStatusCode.CREATED,
    data: response,
    message: "Video link added successfully",
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