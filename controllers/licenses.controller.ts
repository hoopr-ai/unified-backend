import type { Request, Response } from "express";
import {
  licenseTrackService,
  getTokenBalanceService,
  assignTokensService,
  getLicenseHistoryService,
  getBrandLicenseHistoryService,
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
  const trackId = req.params.trackId as string;
  const response = await licenseTrackService(userId, {
    trackId: trackId,
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

export const getLicenseHistory = catchAsync(async (req: AuthRequest, res: Response) => {
  const userId = req.session?.userId;
  if (!userId) {
    return sendError(res, HttpStatusCode.UNAUTHORIZED, "Unauthorized", {});
  }

  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 50;

  const response = await getLicenseHistoryService(userId, page, limit);
  sendResponse(res, {
    status: HttpStatusCode.OK,
    data: response,
    message: "License history retrieved successfully",
  });
});

export const getBrandLicenseHistory = catchAsync(async (req: AuthRequest, res: Response) => {
  const userId = req.session?.userId;
  if (!userId) {
    return sendError(res, HttpStatusCode.UNAUTHORIZED, "Unauthorized", {});
  }

  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 50;

  const response = await getBrandLicenseHistoryService(userId, page, limit);
  sendResponse(res, {
    status: HttpStatusCode.OK,
    data: response,
    message: "Brand license history retrieved successfully",
  });
});
