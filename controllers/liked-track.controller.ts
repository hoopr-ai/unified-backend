import type { Request, Response } from "express";
import {
  likeTrackService,
  unlikeTrackService,
  getLikedTracksService,
  checkTrackLikedService,
} from "../services/business-service/modules.export";
import {
  catchAsync,
  sendResponse,
  sendError,
} from "../services/helper-service/modules.export";
import { ResponseMessages } from "../services/dto-service/constants/response-messages";
import { HttpStatusCode } from "../services/dto-service/modules.export";
import type { SessionPayload } from "../middlewares/authenticate";

interface AuthRequest extends Request {
  session?: SessionPayload;
}

export const likeTrack = catchAsync(async (req: AuthRequest, res: Response) => {
  const userId = req.session?.userId;
  if (!userId) {
    return sendError(res, HttpStatusCode.UNAUTHORIZED, "Unauthorized", {});
  }

  const response = await likeTrackService(userId, req.body);
  sendResponse(res, {
    status: HttpStatusCode.OK,
    data: response,
    message: ResponseMessages.TrackLikedSuccess,
  });
});

export const unlikeTrack = catchAsync(async (req: AuthRequest, res: Response) => {
  const userId = req.session?.userId;
  const { trackCode } = req.body;

  if (!userId) {
    return sendError(res, HttpStatusCode.UNAUTHORIZED, "Unauthorized", {});
  }

  const response = await unlikeTrackService(userId, trackCode);
  sendResponse(res, {
    status: HttpStatusCode.OK,
    data: response,
    message: ResponseMessages.TrackUnlikedSuccess,
  });
});

export const getLikedTracks = catchAsync(async (req: AuthRequest, res: Response) => {
  const userId = req.session?.userId;
  if (!userId) {
    return sendError(res, HttpStatusCode.UNAUTHORIZED, "Unauthorized", {});
  }

  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 10;

  const response = await getLikedTracksService(userId, page, limit);
  sendResponse(res, {
    status: HttpStatusCode.OK,
    data: response,
    message: ResponseMessages.GetLikedTracksSuccess,
  });
});

export const checkTrackLiked = catchAsync(async (req: AuthRequest, res: Response) => {
  const userId = req.session?.userId;
  const trackCode = req.params.trackCode as string;

  if (!userId) {
    return sendError(res, HttpStatusCode.UNAUTHORIZED, "Unauthorized", {});
  }

  const response = await checkTrackLikedService(userId, trackCode);
  sendResponse(res, {
    status: HttpStatusCode.OK,
    data: response,
    message: "Success",
  });
});
