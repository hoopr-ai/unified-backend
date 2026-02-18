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

export const getAllTracks = catchAsync(async (req: AuthRequest, res: Response) => {
  const userId = req.session?.userId;
  // Parse type: supports ?type=a,b,c or ?type=a&type=b or ?type=["a","b"]
  let types: string[] | undefined;
  const typeParam = req.query.type;
  if (typeParam) {
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
  }

  const query: GetAllTracksRequestData = {
    page: req.query.page as string,
    limit: req.query.limit as string,
    trending: req.query.trending as string,
    type: types && types.length > 0 ? types : undefined,
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
    };
    const response = await getTracksByCodesService(query, userId);
    sendResponse(res, { status: HttpStatusCode.OK, data: response, message: ResponseMessages.GetTracksSuccess });
  },
);

export const getTracksByFilter = catchAsync(
  async (req: AuthRequest, res: Response) => {
    const userId = req.session?.userId;
    const filterIdsParam = req.query.filterIds;
    let filterIds: string[] = [];

    if (Array.isArray(filterIdsParam)) {
      filterIds = filterIdsParam.map((id) => String(id).trim()).filter((id) => id.length > 0);
    } else if (typeof filterIdsParam === "string") {
      const trimmed = filterIdsParam.trim();
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          filterIds = parsed.map((id: unknown) => String(id).trim()).filter((id) => id.length > 0);
        } else {
          // Parsed successfully but not an array, treat as comma-separated
          filterIds = trimmed.split(",").map((id) => id.trim()).filter((id) => id.length > 0);
        }
      } catch {
        // JSON parsing failed, treat as comma-separated values
        filterIds = trimmed.split(",").map((id) => id.trim()).filter((id) => id.length > 0);
      }
    }

    const query: GetTracksByFilterQuery = {
      filterName: req.params.filterName as string,
      filterIds,
      page: req.query.page as string,
      limit: req.query.limit as string,
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
