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
import type { SessionPayload } from "../middlewares/authenticate";

interface AuthRequest extends Request {
  session?: SessionPayload;
}

// Parse type query param: supports ?type=a,b,c or ?type=a&type=b or ?type=["a","b"]
const parseTypeParam = (typeParam: unknown): string[] | undefined => {
  if (!typeParam) return undefined;

  let types: string[];
  if (Array.isArray(typeParam)) {
    types = typeParam.map((t) => String(t).trim()).filter(Boolean);
  } else {
    const trimmed = String(typeParam).trim();
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        types = parsed.map((t: unknown) => String(t).trim()).filter(Boolean);
      } else {
        types = trimmed.split(",").map((t) => t.trim()).filter(Boolean);
      }
    } catch {
      types = trimmed.split(",").map((t) => t.trim()).filter(Boolean);
    }
  }

  return types.length > 0 ? types : undefined;
};

export const getAllTracks = catchAsync(async (req: AuthRequest, res: Response) => {
  const userId = req.session?.userId;
  const query: GetAllTracksRequestData = {
    page: req.query.page as string,
    limit: req.query.limit as string,
    trending: req.query.trending as string,
    type: parseTypeParam(req.query.type),
  };
  const response = await getAllTracksService(query, userId);
  sendResponse(res, { status: HttpStatusCode.OK, data: response, message: ResponseMessages.GetTracksSuccess });
});

export const getTracksByCodes = catchAsync(
  async (req: AuthRequest, res: Response) => {
    const userId = req.session?.userId;
    const query: GetTracksByCodesQuery = {
      trackCodes: req.body.trackCodes as string[],
      page: req.query.page as string,
      limit: req.query.limit as string,
      type: req.body.type as string[] | undefined,
    };
    const response = await getTracksByCodesService(query, userId);
    sendResponse(res, { status: HttpStatusCode.OK, data: response, message: ResponseMessages.GetTracksSuccess });
  },
);

export const getTracksByFilter = catchAsync(
  async (req: AuthRequest, res: Response) => {
    const userId = req.session?.userId;
    const query: GetTracksByFilterQuery = {
      filterName: req.params.filterName as string,
      filterIds: req.body.filterIds as string[] || [],
      page: req.query.page as string,
      limit: req.query.limit as string,
      type: req.body.type as string[] | undefined,
    };
    const response = await getTracksByFilterService(query, userId);
    sendResponse(res, { status: HttpStatusCode.OK, data: response, message: ResponseMessages.GetTracksByFilterSuccess });
  },
);

export const getTrackDetailsByCode = catchAsync(
  async (req: AuthRequest, res: Response) => {
    const userId = req.session?.userId;
    const trackCode = req.params.trackCode as string;
    const response = await getTrackDetailsByCodeService(trackCode, userId);

    if (!response) {
      sendResponse(res, { status: HttpStatusCode.NOT_FOUND, data: null, message: ResponseMessages.TrackNotFound });
      return;
    }

    sendResponse(res, { status: HttpStatusCode.OK, data: response, message: ResponseMessages.GetTrackDetailSuccess });
  },
);
