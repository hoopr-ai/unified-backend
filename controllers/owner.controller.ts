import type { Request, Response } from "express";
import { getAllOwnersService } from "../services/business-service/owner/owner.service";
import { catchAsync, sendResponse } from "../services/helper-service/modules.export";
import { ResponseMessages } from "../services/dto-service/constants/response-messages";
import { HttpStatusCode } from "../services/dto-service/modules.export";

export const getAllOwners = catchAsync(async (req: Request, res: Response) => {
  const response = await getAllOwnersService(
    req.query.page as string,
    req.query.limit as string,
  );
  sendResponse(res, {
    status: HttpStatusCode.OK,
    data: response,
    message: ResponseMessages.GetOwnersSuccess,
  });
});
