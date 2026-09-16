import type { Request, Response } from "express";
import type Joi from "joi";
import {
  catchAsync,
  sendResponse,
  AppError,
} from "../services/helper-service/modules.export";
import { HttpStatusCode } from "../services/dto-service/constants/modules.export";
import {
  plgAuditQuerySchema,
  plgEmptyQuerySchema,
  plgFunnelQuerySchema,
  plgInsightsQuerySchema,
  plgJourneyQuerySchema,
  plgPathsQuerySchema,
  plgPeopleQuerySchema,
  plgRetentionQuerySchema,
  plgStageQuerySchema,
  plgSubFunnelQuerySchema,
  plgTrendQuerySchema,
} from "../middlewares/admin-plg-analytics.validation";
import {
  getPlgAuditService,
  getPlgCatalogueService,
  getPlgFunnelService,
  getPlgInsightsService,
  getPlgJourneyService,
  getPlgPathsService,
  getPlgPeopleService,
  getPlgRetentionService,
  getPlgStageService,
  getPlgSubFunnelService,
  getPlgTrendService,
  type Granularity,
  type PeopleQuery,
  type PlgFilters,
  type RetentionFilters,
} from "../services/business-service/creator-analytics/plg/modules.export";

// The PLG growth views under Creator Users & Analytics. All read-only GETs,
// validated against req.query, in the same shape as the rest of this section.

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

type WithExtras<T> = PlgFilters & T;

/** The lifecycle funnel, its previous period, and optionally a segment split. */
export const getPlgFunnel = catchAsync(async (req: Request, res: Response) => {
  const f = validate<WithExtras<{ compare?: string }>>(plgFunnelQuerySchema, req.query);
  const data = await getPlgFunnelService(f, f.compare ?? null);
  return ok(res, data, "Growth funnel fetched successfully.");
});

export const getPlgTrend = catchAsync(async (req: Request, res: Response) => {
  const f = validate<WithExtras<{ granularity: Granularity }>>(plgTrendQuerySchema, req.query);
  const data = await getPlgTrendService(f, f.granularity);
  return ok(res, data, "Growth trend fetched successfully.");
});

/** One stage's deep-dive. */
export const getPlgStage = catchAsync(async (req: Request, res: Response) => {
  const f = validate<WithExtras<{ stage: string }>>(plgStageQuerySchema, req.query);
  const data = await getPlgStageService(f, f.stage);
  return ok(res, data, "Stage analysis fetched successfully.");
});

export const getPlgSubFunnel = catchAsync(async (req: Request, res: Response) => {
  const f = validate<WithExtras<{ key: string }>>(plgSubFunnelQuerySchema, req.query);
  const data = await getPlgSubFunnelService(f, f.key);
  return ok(res, data, "Sub-funnel fetched successfully.");
});

/** The people behind any number. Returns contact details — same grant as the Users CMS. */
export const getPlgPeople = catchAsync(async (req: Request, res: Response) => {
  const f = validate<WithExtras<Omit<PeopleQuery, "stage"> & { stage?: string }>>(
    plgPeopleQuerySchema,
    req.query,
  );
  const data = await getPlgPeopleService(f, f);
  return ok(res, data, "People fetched successfully.");
});

export const getPlgPaths = catchAsync(async (req: Request, res: Response) => {
  const f = validate<WithExtras<{ target: string; limit: number }>>(plgPathsQuerySchema, req.query);
  const data = await getPlgPathsService(f, f.target, f.limit);
  return ok(res, data, "Journey paths fetched successfully.");
});

export const getPlgInsights = catchAsync(async (req: Request, res: Response) => {
  const f = validate<PlgFilters>(plgInsightsQuerySchema, req.query);
  const data = await getPlgInsightsService(f);
  return ok(res, data, "Insights fetched successfully.");
});

/** One person's chronological journey, by user id, browser id, email or mobile. */
export const getPlgJourney = catchAsync(async (req: Request, res: Response) => {
  const { person } = validate<{ person: string }>(plgJourneyQuerySchema, req.query);
  const data = await getPlgJourneyService(person);
  return ok(res, data, data.found ? "Journey fetched successfully." : "No person matched.");
});

export const getPlgRetention = catchAsync(async (req: Request, res: Response) => {
  const f = validate<RetentionFilters>(plgRetentionQuerySchema, req.query);
  const data = await getPlgRetentionService(f);
  return ok(res, data, "Retention fetched successfully.");
});

/** The metric dictionary, stages, sub-funnels, segments and known tracking gaps. */
export const getPlgCatalogue = catchAsync(async (req: Request, res: Response) => {
  validate(plgEmptyQuerySchema, req.query);
  return ok(res, getPlgCatalogueService(), "Growth catalogue fetched successfully.");
});

/** Live data audit: is every source behind the metrics arriving? */
export const getPlgAudit = catchAsync(async (req: Request, res: Response) => {
  const { days } = validate<{ days: number }>(plgAuditQuerySchema, req.query);
  const data = await getPlgAuditService(days);
  return ok(res, data, "Data audit fetched successfully.");
});
