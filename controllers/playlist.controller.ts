import type { Request, Response } from "express";
import {
  getAllPlaylistsService,
  getPlaylistDetailService,
  searchPlaylistsService,
} from "../services/business-service/modules.export";
import { catchAsync, sendResponse, sendError } from "../services/helper-service/modules.export";
import { ResponseMessages } from "../services/dto-service/constants/response-messages";
import { GetAllPlaylistsQuery, GetPlaylistDetailQuery, HttpStatusCode } from "../services/dto-service/modules.export";
import type { SessionPayload } from "../middlewares/authenticate";
import { findUserById } from "../services/persistence-service/exports";

interface AuthRequest extends Request {
  session?: SessionPayload;
}

export const getAllPlaylists = catchAsync(async (req: Request, res: Response) => {
  const query: GetAllPlaylistsQuery = {
    page: req.query.page as string,
    limit: req.query.limit as string,
    status: req.query.status as string,
  };
  const response = await getAllPlaylistsService(query);
  sendResponse(res, { status: HttpStatusCode.OK, data: response, message: ResponseMessages.GetPlaylistsSuccess });
});

export const getPlaylistDetail = catchAsync(async (req: AuthRequest, res: Response) => {
  const userId = req.session?.userId;
  const user = userId ? await findUserById(userId) : null;
  const brandId = user?.brandId;
  const query: GetPlaylistDetailQuery = {
    playlistCode: req.params.playlistCode as string,
  };
  const response = await getPlaylistDetailService(query, brandId);
  if (!response) {
    return sendError(res, HttpStatusCode.NOT_FOUND, ResponseMessages.PlaylistNotFound);
  }
  sendResponse(res, { status: HttpStatusCode.OK, data: response, message: ResponseMessages.GetPlaylistDetailSuccess });
});

export const searchPlaylists = catchAsync(async (req: Request, res: Response) => {
  const name = req.query.name as string;
  if (!name || name.trim().length < 1) {
    return sendError(res, HttpStatusCode.BAD_REQUEST, "Search query 'name' is required");
  }
  const response = await searchPlaylistsService({
    name,
    limit: req.query.limit as string,
  });
  sendResponse(res, { status: HttpStatusCode.OK, data: { playlists: response }, message: "Playlists search successful" });
});
