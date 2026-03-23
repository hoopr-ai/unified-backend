import type { Request, Response } from "express";
import { catchAsync, sendResponse } from "../services/helper-service/modules.export";
import { ResponseMessages, HttpStatusCode } from "../services/dto-service/modules.export";
import { getOccasionsService, getTracksByOccasionService } from "../services/business-service/occasion/modules.export";
import { findUserById } from "../services/persistence-service/exports";
import type { SessionPayload } from "../middlewares/authenticate";

interface AuthRequest extends Request {
  session?: SessionPayload;
}

export const getOccasions = catchAsync(async (_req: Request, res: Response) => {
  const occasions = await getOccasionsService();
  sendResponse(res, {
    status: HttpStatusCode.OK,
    data: occasions,
    message: ResponseMessages.GetOccasionsSuccess,
  });
});

export const getTracksByOccasion = catchAsync(async (req: AuthRequest, res: Response) => {
  const userId = req.session?.userId;
  const user = userId ? await findUserById(userId) : null;
  const brandId = user?.brandId;
  const occasionId = parseInt(req.params.occasionId as string, 10);
  const page = parseInt((req.query.page as string) || "1", 10);
  const limit = parseInt((req.query.limit as string) || "10", 10);

  const response = await getTracksByOccasionService(occasionId, page, limit, userId, brandId);
  sendResponse(res, {
    status: HttpStatusCode.OK,
    data: response,
    message: ResponseMessages.GetTracksSuccess,
  });
});
