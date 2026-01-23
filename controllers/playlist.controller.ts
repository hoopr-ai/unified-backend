import type { Request, Response } from "express";
import {
  getAllPlaylistsService,
  GetAllPlaylistsQuery,
} from "../services/business-service/modules.export";
import { catchAsync } from "../services/helper-service/modules.export";
import { ResponseMessages } from "../services/dto-service/constants/response-messages";

export const getAllPlaylists = catchAsync(async (req: Request, res: Response) => {
  const query: GetAllPlaylistsQuery = {
    page: req.query.page as string,
    limit: req.query.limit as string,
    status: req.query.status as string,
  };

  const response = await getAllPlaylistsService(query);

  res.status(200).json({
    data: response,
    error: { code: 0, message: ResponseMessages.GetPlaylistsSuccess },
  });
});
