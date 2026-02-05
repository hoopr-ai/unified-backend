import type { Request, Response } from "express";
import {
  getAllTracksService,
  getTracksByCodesService,
  getTracksByFilterService,
  getTrackDetailsByCodeService,
  GetTracksByFilterQuery,
} from "../services/business-service/modules.export";
import { catchAsync, sendResponse } from "../services/helper-service/modules.export";
import { ResponseMessages } from "../services/dto-service/constants/response-messages";
import { GetAllTracksRequestData, GetTracksByCodesQuery, HttpStatusCode } from "../services/dto-service/modules.export";

export const getAllTracks = catchAsync(async (req: Request, res: Response) => {
  const query: GetAllTracksRequestData = {
    page: req.query.page as string,
    limit: req.query.limit as string,
    trending: req.query.trending as string,
  };
  const response = await getAllTracksService(query);
  sendResponse(res, { status: HttpStatusCode.OK, data: response, message: ResponseMessages.GetTracksSuccess });
});

export const getTracksByCodes = catchAsync(
  async (req: Request, res: Response) => {
    const query: GetTracksByCodesQuery = {
      trackCodes: req.body.trackCodes as string[],
      page: req.query.page as string,
      limit: req.query.limit as string,
    };
    const response = await getTracksByCodesService(query);
    sendResponse(res, { status: HttpStatusCode.OK, data: response, message: ResponseMessages.GetTracksSuccess });
  },
);

export const getTracksByFilter = catchAsync(
  async (req: Request, res: Response) => {
    const query: GetTracksByFilterQuery = {
      filterName: req.params.filterName as string,
      filterId: req.params.filterId as string,
      page: req.query.page as string,
      limit: req.query.limit as string,
    };
    const response = await getTracksByFilterService(query);
    sendResponse(res, { status: HttpStatusCode.OK, data: response, message: ResponseMessages.GetTracksByFilterSuccess });
  },
);

export const getTrackDetailsByCode = catchAsync(
  async (req: Request, res: Response) => {
    const trackCode = req.params.trackCode as string;
    const response = await getTrackDetailsByCodeService(trackCode);

    if (!response) {
      sendResponse(res, { status: HttpStatusCode.NOT_FOUND, data: null, message: ResponseMessages.TrackNotFound });
      return;
    }

    sendResponse(res, { status: HttpStatusCode.OK, data: response, message: ResponseMessages.GetTrackDetailSuccess });
  },
);
