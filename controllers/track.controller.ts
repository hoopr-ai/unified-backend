import type { Request, Response } from "express";
import {
  getAllTracksService,
  getTracksByCodesService,
  getTracksByFilterService,
  getTrackDetailsByCodeService,
  searchTracksService,
  GetTracksByFilterQuery,
  getRandomTrackPreviewService,
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
import { searchBrands } from "../services/persistence-service/brand/brand.persistence.service";

interface AuthRequest extends Request {
  session?: SessionPayload;
}

// Helper function to strip mp3Link and waveformLink from tracks for unauthenticated users
const stripMediaUrls = <
  T extends { mp3Link?: string | null; waveformLink?: string | null },
>(
  tracks: T[],
): T[] => {
  return tracks.map((track) => ({
    ...track,
    mp3Link: null,
    waveformLink: null,
  }));
};

export const getAllTracks = catchAsync(
  async (req: AuthRequest, res: Response) => {
    const userId = req.session?.userId;
    const platform = req.session?.platform;
    const user = userId ? await findUserById(userId) : null;
    const brandId = user?.brandId;
    const toBoolean = (val: unknown): boolean => val === true || val === "true";
    const toStringArray = (val: unknown): string[] | undefined => {
      if (val === undefined || val === null) return undefined;
      if (Array.isArray(val)) return val as string[];
      if (typeof val === "string") return [val];
      return undefined;
    };
    const query: GetAllTracksRequestData = {
      page: req.query.page as string,
      limit: req.query.limit as string,
      trending: toBoolean(req.body.trending),
      popular: toBoolean(req.body.popular),
      newOnHoopr: toBoolean(req.body.newOnHoopr),
      movie: toBoolean(req.body.movie),
      type: req.body.type as string[] | undefined,
      ownerCode: req.body.ownerCode as string[] | undefined,
      subType: toStringArray(req.body.subType),
      campaign: toBoolean(req.body.campaign) || false,
      releaseYearFrom: req.body.releaseYearFrom
        ? Number(req.body.releaseYearFrom)
        : undefined,
      releaseYearTo: req.body.releaseYearTo
        ? Number(req.body.releaseYearTo)
        : undefined,
    };
    const response = await getAllTracksService(
      query,
      userId,
      brandId,
      platform,
    );

    // Strip mp3Link and waveformLink for unauthenticated users
    const data = userId
      ? response
      : {
          ...response,
          tracks: stripMediaUrls(response.tracks),
        };

    sendResponse(res, {
      status: HttpStatusCode.OK,
      data,
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

    // Strip mp3Link and waveformLink for unauthenticated users
    const data = userId
      ? response
      : {
          ...response,
          tracks: stripMediaUrls(response.tracks),
        };

    sendResponse(res, {
      status: HttpStatusCode.OK,
      data,
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

    // Strip mp3Link and waveformLink for unauthenticated users
    const data = userId
      ? response
      : {
          ...response,
          tracks: stripMediaUrls(response.tracks),
        };

    sendResponse(res, {
      status: HttpStatusCode.OK,
      data,
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
    const response = await getTrackDetailsByCodeService(
      trackCode,
      userId,
      brandId,
    );

    if (!response) {
      sendResponse(res, {
        status: HttpStatusCode.NOT_FOUND,
        data: null,
        message: ResponseMessages.TrackNotFound,
      });
      return;
    }

    // Strip mp3Link and waveformLink for unauthenticated users
    const data = userId
      ? response
      : {
          ...response,
          mp3Link: null,
          waveformLink: null,
        };

    sendResponse(res, {
      status: HttpStatusCode.OK,
      data,
      message: ResponseMessages.GetTrackDetailSuccess,
    });
  },
);

export const searchTracks = catchAsync(
  async (req: Request, res: Response) => {
    const query = (req.query.q as string) || "";
    const limit = parseInt(req.query.limit as string, 10) || 20;

    const results = await searchTracksService(query, Math.min(limit, 50));

    sendResponse(res, {
      status: HttpStatusCode.OK,
      data: { tracks: results },
      message: ResponseMessages.GetTracksSuccess,
    });
  },
);

export const searchBrandsController = catchAsync(
  async (req: Request, res: Response) => {
    const query = (req.query.q as string) || "";
    const limit = parseInt(req.query.limit as string, 10) || 20;

    const results = await searchBrands(query, Math.min(limit, 50));

    sendResponse(res, {
      status: HttpStatusCode.OK,
      data: { brands: results },
      message: "Brands fetched successfully",
    });
  },
);

/**
 * Get a random track preview with short-lived signed URL
 * Public API - no authentication required
 * Returns a random track from owner with ownerCode='2' with a signed URL valid for 10-30 seconds
 */
export const getRandomTrackPreview = catchAsync(
  async (req: Request, res: Response) => {
    // Owner code is fixed to '2' as per requirement
    const ownerCode = "2";

    // Allow configurable expiry between 10-30 seconds, default 30
    const requestedExpiry = parseInt(req.query.expiry as string, 10);
    const expiresInSeconds = Number.isNaN(requestedExpiry)
      ? 30
      : Math.min(Math.max(requestedExpiry, 10), 30);

    const result = await getRandomTrackPreviewService(ownerCode, expiresInSeconds);

    if (!result) {
      sendResponse(res, {
        status: HttpStatusCode.NOT_FOUND,
        data: null,
        message: "No tracks available for preview",
      });
      return;
    }

    sendResponse(res, {
      status: HttpStatusCode.OK,
      data: result,
      message: "Random track preview fetched successfully",
    });
  },
);
