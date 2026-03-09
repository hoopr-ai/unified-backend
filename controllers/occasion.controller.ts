import type { Request, Response } from "express";
import { catchAsync, sendResponse } from "../services/helper-service/modules.export";
import { ResponseMessages, HttpStatusCode } from "../services/dto-service/modules.export";
import { getOccasionsService } from "../services/business-service/occasion/modules.export";

export const getOccasions = catchAsync(async (_req: Request, res: Response) => {
  const occasions = await getOccasionsService();
  sendResponse(res, {
    status: HttpStatusCode.OK,
    data: occasions,
    message: ResponseMessages.GetOccasionsSuccess,
  });
});
