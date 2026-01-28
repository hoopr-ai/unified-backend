import type { Request, Response } from "express";
import {
  getAllTracksService,
  getTracksByCodesService,
  getTracksByFilterService,
  GetTracksByFilterQuery,
} from "../services/business-service/modules.export";
import { catchAsync, sendSuccess } from "../services/helper-service/modules.export";
import { ResponseMessages } from "../services/dto-service/constants/response-messages";
import { GetAllTracksRequestData, GetTracksByCodesQuery } from "../services/dto-service/modules.export";

export const getAllTracks = catchAsync(async (req: Request, res: Response) => {
  const query: GetAllTracksRequestData = {
    page: req.query.page as string,
    limit: req.query.limit as string,
    trending: req.query.trending as string,
  };

  const response = await getAllTracksService(query);

  sendSuccess(res, response, ResponseMessages.GetTracksSuccess);
});

export const getTracksByCodes = catchAsync(
  async (req: Request, res: Response) => {
    const query: GetTracksByCodesQuery = {
      trackCodes: req.body.trackCodes as string[],
      page: req.query.page as string,
      limit: req.query.limit as string,
    };

    const response = await getTracksByCodesService(query);

    sendSuccess(res, response, ResponseMessages.GetTracksSuccess);
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

    sendSuccess(res, response, ResponseMessages.GetTracksByFilterSuccess);
  },
);
