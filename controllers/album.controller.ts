import type { Request, Response } from "express";
import {
  getAllAlbumsService,
  getAlbumTracksService,
} from "../services/business-service/modules.export";
import {
  catchAsync,
  sendResponse,
} from "../services/helper-service/modules.export";
import { ResponseMessages } from "../services/dto-service/constants/response-messages";
import {
  GetAlbumsRequestData,
  HttpStatusCode,
} from "../services/dto-service/modules.export";
import type { SessionPayload } from "../middlewares/authenticate";
import { findUserById } from "../services/persistence-service/exports";

interface AuthRequest extends Request {
  session?: SessionPayload;
}

export const getAllAlbums = catchAsync(
  async (req: AuthRequest, res: Response) => {
    const userId = req.session?.userId;
    const user = userId ? await findUserById(userId) : null;
    const brandId = user?.brandId;

    const query: GetAlbumsRequestData = {
      type: req.body.type as string[] | undefined,
      page: req.query.page as string,
      limit: req.query.limit as string,
    };

    const response = await getAllAlbumsService(query, brandId);
    sendResponse(res, {
      status: HttpStatusCode.OK,
      data: response,
      message: ResponseMessages.GetAlbumsSuccess,
    });
  },
);

export const getAlbumTracks = catchAsync(
  async (req: AuthRequest, res: Response) => {
    const albumId = req.params.albumId as string;
    const userId = req.session?.userId;
    const user = userId ? await findUserById(userId) : null;
    const brandId = user?.brandId;

    const response = await getAlbumTracksService(albumId, userId, brandId);

    if (!response) {
      sendResponse(res, {
        status: HttpStatusCode.NOT_FOUND,
        data: null,
        message: ResponseMessages.AlbumNotFound,
      });
      return;
    }

    sendResponse(res, {
      status: HttpStatusCode.OK,
      data: response,
      message: ResponseMessages.GetAlbumTracksSuccess,
    });
  },
);
