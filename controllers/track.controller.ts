import type { Request, Response } from "express";
import {
  getAllTracksService,
  getTracksByCodesService,
  getTracksByFilterService,
  GetAllTracksQuery,
  GetTracksByCodesQuery,
  GetTracksByFilterQuery,
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

export const getTracksByCodes = catchAsync(
  async (req: Request, res: Response) => {
    const query: GetTracksByCodesQuery = {
      trackCodes: req.body.trackCodes as string[],
      page: req.query.page as string,
      limit: req.query.limit as string,
    };

    const response = await getTracksByCodesService(query);

    res.status(200).json({
      data: response,
      error: { code: 0, message: ResponseMessages.GetTracksSuccess },
    });
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

    res.status(200).json({
      data: response,
      error: { code: 0, message: ResponseMessages.GetTracksByFilterSuccess },
    });
  },
);
