import type { Request, Response } from "express";
import type Joi from "joi";
import {
  catchAsync,
  sendResponse,
  AppError,
} from "../services/helper-service/modules.export";
import { HttpStatusCode } from "../services/dto-service/constants/modules.export";
import {
  nativeRangeQuerySchema,
  nativeSessionsQuerySchema,
  nativeSessionIdSchema,
  nativeVisitorIdSchema,
  nativeEmptyQuerySchema,
  nativeUtmQuerySchema,
  nativeUtmBreakdownQuerySchema,
} from "../middlewares/admin-native-analytics.validation";
import {
  getOverviewService,
  getTimeseriesService,
  getPlatformsService,
  getGeographyService,
  getAcquisitionService,
  getTechHealthService,
  getRetentionService,
  getPagesService,
  getEventsService,
  getFunnelService,
  getSessionsService,
  getSessionDetailService,
  getVisitorSessionsService,
  getFilterOptionsService,
  getUtmOverviewService,
  getUtmBreakdownService,
  getUtmTimeseriesService,
  getUtmDetailService,
  getUtmHygieneService,
  getUtmValuesService,
  type NativeFilters,
  type SessionListFilters,
  type UtmFilters,
} from "../services/business-service/native-analytics/modules.export";

// Read-only endpoints backing the internal-fe "Native Analytics" dashboard.
//
// All GETs, so validation happens here against req.query — the same shape as
// admin-enterprise-analytics.controller.ts.

const validate = <T>(schema: Joi.ObjectSchema, payload: unknown): T => {
  const { value, error } = schema.validate(payload, {
    abortEarly: false,
    stripUnknown: true,
    convert: true,
  });
  if (error) {
    throw new AppError(error.details.map((d) => d.message).join(", "), 400);
  }
  return value as T;
};

const ok = (res: Response, data: unknown, message: string) =>
  sendResponse(res, { status: HttpStatusCode.OK, data, message });

/** Every aggregate endpoint takes the same range + three filters. */
const filtersOf = (req: Request): NativeFilters =>
  validate<NativeFilters>(nativeRangeQuerySchema, req.query);

export const getNativeOverview = catchAsync(
  async (req: Request, res: Response) => {
    const data = await getOverviewService(filtersOf(req));
    return ok(res, data, "Native analytics overview fetched successfully.");
  },
);

export const getNativeTimeseries = catchAsync(
  async (req: Request, res: Response) => {
    const data = await getTimeseriesService(filtersOf(req));
    return ok(res, data, "Native analytics timeseries fetched successfully.");
  },
);

export const getNativePlatforms = catchAsync(
  async (req: Request, res: Response) => {
    const data = await getPlatformsService(filtersOf(req));
    return ok(res, data, "Platform breakdown fetched successfully.");
  },
);

export const getNativeGeography = catchAsync(
  async (req: Request, res: Response) => {
    const data = await getGeographyService(filtersOf(req));
    return ok(res, data, "Geography breakdown fetched successfully.");
  },
);

export const getNativeAcquisition = catchAsync(
  async (req: Request, res: Response) => {
    const data = await getAcquisitionService(filtersOf(req));
    return ok(res, data, "Acquisition breakdown fetched successfully.");
  },
);

export const getNativeTechHealth = catchAsync(
  async (req: Request, res: Response) => {
    const data = await getTechHealthService(filtersOf(req));
    return ok(res, data, "Tech health fetched successfully.");
  },
);

export const getNativeRetention = catchAsync(
  async (req: Request, res: Response) => {
    const data = await getRetentionService(filtersOf(req));
    return ok(res, data, "Retention cohorts fetched successfully.");
  },
);

export const getNativePages = catchAsync(
  async (req: Request, res: Response) => {
    const data = await getPagesService(filtersOf(req));
    return ok(res, data, "Pages breakdown fetched successfully.");
  },
);

export const getNativeEvents = catchAsync(
  async (req: Request, res: Response) => {
    const data = await getEventsService(filtersOf(req));
    return ok(res, data, "Events breakdown fetched successfully.");
  },
);

export const getNativeFunnel = catchAsync(
  async (req: Request, res: Response) => {
    const data = await getFunnelService(filtersOf(req));
    return ok(res, data, "Funnel fetched successfully.");
  },
);

export const getNativeSessions = catchAsync(
  async (req: Request, res: Response) => {
    const filters = validate<SessionListFilters>(
      nativeSessionsQuerySchema,
      req.query,
    );
    const data = await getSessionsService(filters);
    return ok(res, data, "Sessions fetched successfully.");
  },
);

export const getNativeSessionDetail = catchAsync(
  async (req: Request, res: Response) => {
    const { id } = validate<{ id: string }>(nativeSessionIdSchema, req.params);
    const data = await getSessionDetailService(id);
    return ok(res, data, "Session detail fetched successfully.");
  },
);

export const getNativeVisitorSessions = catchAsync(
  async (req: Request, res: Response) => {
    const { visitorId } = validate<{ visitorId: string }>(
      nativeVisitorIdSchema,
      req.params,
    );
    const data = await getVisitorSessionsService(visitorId);
    return ok(res, data, "Visitor sessions fetched successfully.");
  },
);

export const getNativeFilterOptions = catchAsync(
  async (req: Request, res: Response) => {
    validate(nativeEmptyQuerySchema, req.query);
    const data = await getFilterOptionsService();
    return ok(res, data, "Filter options fetched successfully.");
  },
);

// ─── UTM & campaign analytics ───────────────────────────────────────────────
//
// Same envelope and the same validate-then-delegate shape as everything above.
// The only difference is the schema: these take the UTM narrowing (source /
// medium / campaign / taggedOnly) and, on two of them, a `dimension`.

/** The range + three filters + UTM narrowing, on every /utm/* endpoint. */
const utmFiltersOf = (req: Request): UtmFilters =>
  validate<UtmFilters>(nativeUtmQuerySchema, req.query);

export const getNativeUtmOverview = catchAsync(
  async (req: Request, res: Response) => {
    const data = await getUtmOverviewService(utmFiltersOf(req));
    return ok(res, data, "UTM overview fetched successfully.");
  },
);

export const getNativeUtmBreakdown = catchAsync(
  async (req: Request, res: Response) => {
    const filters = validate<UtmFilters>(
      nativeUtmBreakdownQuerySchema,
      req.query,
    );
    const data = await getUtmBreakdownService(filters);
    return ok(res, data, "UTM breakdown fetched successfully.");
  },
);

export const getNativeUtmTimeseries = catchAsync(
  async (req: Request, res: Response) => {
    const filters = validate<UtmFilters>(
      nativeUtmBreakdownQuerySchema,
      req.query,
    );
    const data = await getUtmTimeseriesService(filters);
    return ok(res, data, "UTM timeseries fetched successfully.");
  },
);

export const getNativeUtmDetail = catchAsync(
  async (req: Request, res: Response) => {
    const data = await getUtmDetailService(utmFiltersOf(req));
    return ok(res, data, "Campaign detail fetched successfully.");
  },
);

export const getNativeUtmHygiene = catchAsync(
  async (req: Request, res: Response) => {
    const data = await getUtmHygieneService(utmFiltersOf(req));
    return ok(res, data, "UTM hygiene report fetched successfully.");
  },
);

export const getNativeUtmValues = catchAsync(
  async (req: Request, res: Response) => {
    const data = await getUtmValuesService(utmFiltersOf(req));
    return ok(res, data, "UTM values fetched successfully.");
  },
);
