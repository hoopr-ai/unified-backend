import type { Request, Response } from "express";
import { getAllFiltersService } from "../services/business-service/modules.export";
import { catchAsync } from "../services/helper-service/modules.export";
import { ResponseMessages } from "../services/dto-service/constants/response-messages";

export const getAllFilters = catchAsync(async (req: Request, res: Response) => {
  const response = await getAllFiltersService();
  res.status(200).json({
    data: response,
    error: { code: 0, message: ResponseMessages.GetFiltersSuccess },
  });
});
