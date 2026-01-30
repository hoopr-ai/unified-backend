import type { Request, Response } from "express";
import {
  downloadTrackService,
  getTokenBalanceService,
  assignTokensService,
  getDownloadHistoryService,
  getBrandDownloadHistoryService,
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

export const downloadTrack = catchAsync(async (req: AuthRequest, res: Response) => {
  const userId = req.session?.userId;
  if (!userId) {
    return sendError(res, HttpStatusCode.UNAUTHORIZED, "Unauthorized", {});
  }

  const response = await downloadTrackService(userId, req.body);
  sendResponse(res, {
    status: HttpStatusCode.OK,
    data: response,
    message: "Track download initiated successfully",
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

export const getDownloadHistory = catchAsync(async (req: AuthRequest, res: Response) => {
  const userId = req.session?.userId;
  if (!userId) {
    return sendError(res, HttpStatusCode.UNAUTHORIZED, "Unauthorized", {});
  }

  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 50;

  const response = await getDownloadHistoryService(userId, page, limit);
  sendResponse(res, {
    status: HttpStatusCode.OK,
    data: response,
    message: "Download history retrieved successfully",
  });
});

export const getBrandDownloadHistory = catchAsync(async (req: AuthRequest, res: Response) => {
  const userId = req.session?.userId;
  if (!userId) {
    return sendError(res, HttpStatusCode.UNAUTHORIZED, "Unauthorized", {});
  }

  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 50;

  const response = await getBrandDownloadHistoryService(userId, page, limit);
  sendResponse(res, {
    status: HttpStatusCode.OK,
    data: response,
    message: "Brand download history retrieved successfully",
  });
});
