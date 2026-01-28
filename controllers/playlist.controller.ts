import type { Request, Response } from "express";
import {
  getAllPlaylistsService,
  getPlaylistDetailService,
} from "../services/business-service/modules.export";
import { catchAsync, sendSuccess, sendError } from "../services/helper-service/modules.export";
import { ResponseMessages } from "../services/dto-service/constants/response-messages";
import { GetAllPlaylistsQuery,  GetPlaylistDetailQuery } from "../services/dto-service/modules.export";

export const getAllPlaylists = catchAsync(async (req: Request, res: Response) => {
  const query: GetAllPlaylistsQuery = {
    page: req.query.page as string,
    limit: req.query.limit as string,
    status: req.query.status as string,
  };

  const response = await getAllPlaylistsService(query);

  sendSuccess(res, response, ResponseMessages.GetPlaylistsSuccess);
});

export const getPlaylistDetail = catchAsync(async (req: Request, res: Response) => {
  const query: GetPlaylistDetailQuery = {
    playlistCode: req.params.playlistCode as string,
  };

  const response = await getPlaylistDetailService(query);

  if (!response) {
    return sendError(res, 404, ResponseMessages.PlaylistNotFound);
  }

  sendSuccess(res, response, ResponseMessages.GetPlaylistDetailSuccess);
});
