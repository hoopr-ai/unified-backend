import type { Request, Response } from "express";
import {
  getAllTracksService,
  getTracksByCodesService,
  getTracksByFilterService,
  getTrackDetailsByCodeService,
  GetTracksByFilterQuery,
} from "../services/business-service/modules.export";
import {
  catchAsync,
  sendResponse,
} from "../services/helper-service/modules.export";
import { ResponseMessages } from "../services/dto-service/constants/response-messages";
import {
  GetAllTracksRequestData,
  GetTracksByCodesQuery,
  HttpStatusCode,
} from "../services/dto-service/modules.export";
import type { SessionPayload } from "../middlewares/authenticate";
import { findUserById } from "../services/persistence-service/exports";

interface AuthRequest extends Request {
  session?: SessionPayload;
}

export const getAllTracks = catchAsync(
  async (req: AuthRequest, res: Response) => {
    const userId = req.session?.userId;
    const platform = req.session?.platform;
    const user = userId ? await findUserById(userId) : null;
    const brandId = user?.brandId;
    const toBoolean = (val: unknown): boolean =>
      val === true || val === "true";
    const query: GetAllTracksRequestData = {
      page: req.query.page as string,
      limit: req.query.limit as string,
      trending: toBoolean(req.body.trending),
      popular: toBoolean(req.body.popular),
      newOnHoopr: toBoolean(req.body.newOnHoopr),
      movie: toBoolean(req.body.movie),
      type: req.body.type as string[] | undefined,
      ownerCode: req.body.ownerCode as string[] | undefined,
      campaign: toBoolean(req.body.campaign),
    };
    const response = await getAllTracksService(query, userId, brandId, platform);
    sendResponse(res, {
      status: HttpStatusCode.OK,
      data: response,
      message: ResponseMessages.GetTracksSuccess,
    });
  },
);

export const getTracksByCodes = catchAsync(
  async (req: AuthRequest, res: Response) => {
    const userId = req.session?.userId;
    const user = userId ? await findUserById(userId) : null;
    const brandId = user?.brandId;
    const query: GetTracksByCodesQuery = {
      trackCodes: req.body.trackCodes as string[],
      page: req.query.page as string,
      limit: req.query.limit as string,
      type: req.body.type as string[] | undefined,
    };
    const response = await getTracksByCodesService(query, userId, brandId);
    sendResponse(res, {
      status: HttpStatusCode.OK,
      data: response,
      message: ResponseMessages.GetTracksSuccess,
    });
  },
);

export const getTracksByFilter = catchAsync(
  async (req: AuthRequest, res: Response) => {
    const userId = req.session?.userId;
    const user = userId ? await findUserById(userId) : null;
    const brandId = user?.brandId;
    const query: GetTracksByFilterQuery = {
      filterName: req.params.filterName as string,
      filterIds: (req.body.filterIds as string[]) || [],
      page: req.query.page as string,
      limit: req.query.limit as string,
      type: req.body.type as string[] | undefined,
    };
    const response = await getTracksByFilterService(query, userId, brandId);
    sendResponse(res, {
      status: HttpStatusCode.OK,
      data: response,
      message: ResponseMessages.GetTracksByFilterSuccess,
    });
  },
);

export const getTrackDetailsByCode = catchAsync(
  async (req: AuthRequest, res: Response) => {
    const userId = req.session?.userId;
    const user = userId ? await findUserById(userId) : null;
    const brandId = user?.brandId;
    const trackCode = req.params.trackCode as string;
    const response = await getTrackDetailsByCodeService(trackCode, userId, brandId);

    if (!response) {
      sendResponse(res, {
        status: HttpStatusCode.NOT_FOUND,
        data: null,
        message: ResponseMessages.TrackNotFound,
      });
      return;
    }

    sendResponse(res, {
      status: HttpStatusCode.OK,
      data: response,
      message: ResponseMessages.GetTrackDetailSuccess,
    });
  },
);
