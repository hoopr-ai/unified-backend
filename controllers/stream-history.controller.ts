import type { Request, Response } from "express";
import { recordStreamService, getStreamHistoryService } from "../services/business-service/modules.export";
import { catchAsync, sendResponse } from "../services/helper-service/modules.export";
import { HttpStatusCode, StreamType } from "../services/dto-service/modules.export";
import { ResponseMessages } from "../services/dto-service/constants/response-messages";
import type { SessionPayload } from "../middlewares/authenticate";

interface AuthRequest extends Request {
  session?: SessionPayload;
}

export const recordStream = catchAsync(async (req: AuthRequest, res: Response) => {
  const userId = req.session?.userId;
  const platform = req.session?.platform;
  const response = await recordStreamService(req.body, userId, platform);
  sendResponse(res, {
    status: HttpStatusCode.OK,
    data: response,
    message: "Stream recorded successfully.",
  });
});

export const getStreamHistory = catchAsync(async (req: AuthRequest, res: Response) => {
  const userId = req.session?.userId!;
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 10;
  const response = await getStreamHistoryService(userId, page, limit);
  sendResponse(res, {
    status: HttpStatusCode.OK,
    data: response,
    message: ResponseMessages.GetTracksSuccess,
  });
});
