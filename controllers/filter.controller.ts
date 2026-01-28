import type { Request, Response } from "express";
import { getAllFiltersService } from "../services/business-service/modules.export";
import { catchAsync, sendResponse } from "../services/helper-service/modules.export";
import { ResponseMessages } from "../services/dto-service/constants/response-messages";
import { HttpStatusCode } from "../services/dto-service/modules.export";

export const getAllFilters = catchAsync(async (req: Request, res: Response) => {
  const response = await getAllFiltersService();
  sendResponse(res, { status: HttpStatusCode.OK, data: response, message: ResponseMessages.GetFiltersSuccess });
});
