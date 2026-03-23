import type { Request, Response } from "express";
import {
  getFeaturedTracksService,
  upsertFeaturedTracksService,
} from "../services/business-service/modules.export";
import {
  catchAsync,
  sendResponse,
} from "../services/helper-service/modules.export";
import { ResponseMessages } from "../services/dto-service/constants/response-messages";
import { HttpStatusCode } from "../services/dto-service/modules.export";
import type { SessionPayload } from "../middlewares/authenticate";

interface AuthRequest extends Request {
  session?: SessionPayload;
}

// GET /featured-tracks/:platform - Get featured tracks for a platform (public API)
export const getFeaturedTracks = catchAsync(
  async (req: Request, res: Response) => {
    const platform = req.query.platform as string;

    if (!platform) {
      sendResponse(res, {
        status: HttpStatusCode.BAD_REQUEST,
        data: null,
        message: "Platform is required",
      });
      return;
    }

    const response = await getFeaturedTracksService(platform);

    if (!response) {
      sendResponse(res, {
        status: HttpStatusCode.NOT_FOUND,
        data: null,
        message: ResponseMessages.FeaturedTracksNotFound,
      });
      return;
    }

    sendResponse(res, {
      status: HttpStatusCode.OK,
      data: response,
      message: ResponseMessages.GetFeaturedTracksSuccess,
    });
  },
);

// POST /featured-tracks - Create or update featured tracks for the user's platform
export const upsertFeaturedTracks = catchAsync(
  async (req: AuthRequest, res: Response) => {
    const platform = req.session?.platform;
    const { trackCodes } = req.body;

    if (!platform) {
      sendResponse(res, {
        status: HttpStatusCode.BAD_REQUEST,
        data: null,
        message: "Platform not found in session",
      });
      return;
    }

    if (!trackCodes || !Array.isArray(trackCodes)) {
      sendResponse(res, {
        status: HttpStatusCode.BAD_REQUEST,
        data: null,
        message: "trackCodes must be an array",
      });
      return;
    }

    const response = await upsertFeaturedTracksService(platform, trackCodes);

    sendResponse(res, {
      status: HttpStatusCode.OK,
      data: response,
      message: ResponseMessages.UpsertFeaturedTracksSuccess,
    });
  },
);
