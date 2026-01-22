import type { Request, Response } from "express";
import {
  getAllTracksService,
  GetAllTracksQuery,
} from "../services/business-service/modules.export";
import { catchAsync } from "../services/helper-service/modules.export";
import { ResponseMessages } from "../services/dto-service/constants/response-messages";

export const getAllTracks = catchAsync(async (req: Request, res: Response) => {
  const query: GetAllTracksQuery = {
    page: req.query.page as string,
    limit: req.query.limit as string,
    trending: req.query.trending as string,
  };

  const response = await getAllTracksService(query);

  res.status(200).json({
    data: response,
    error: { code: 0, message: ResponseMessages.GetTracksSuccess },
  });
});
