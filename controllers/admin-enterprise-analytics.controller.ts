import type { Request, Response } from "express";
import type Joi from "joi";
import {
  catchAsync,
  sendResponse,
  AppError,
} from "../services/helper-service/modules.export";
import { HttpStatusCode } from "../services/dto-service/constants/modules.export";
import {
  rangeQuerySchema,
  csAccountsQuerySchema,
  emptyQuerySchema,
} from "../middlewares/admin-enterprise-analytics.validation";
import {
  getFounderOverviewService,
  getFounderTokenEconomicsService,
  getFounderFunnelService,
  getFounderEngagementService,
  getFounderMusicService,
  getFounderRetentionService,
  getCsAccountsService,
  getCsAlertsService,
  getProductFunnelService,
  getProductSearchInsightsService,
  getProductTokenSpendService,
  getProductBehaviorService,
} from "../services/business-service/enterprise-analytics/modules.export";

// All endpoints are GETs, so validation happens here on req.query (the same
// pattern admin-pay-per-track.controller uses).
const validateQuery = <T>(schema: Joi.ObjectSchema, query: unknown): T => {
  const { value, error } = schema.validate(query, {
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

type Range = { startDate: string; endDate: string };

// ─── Founder ─────────────────────────────────────────────────────────────────

export const getFounderOverview = catchAsync(async (req: Request, res: Response) => {
  const value = validateQuery<Range>(rangeQuerySchema, req.query);
  ok(res, await getFounderOverviewService(value), "Founder overview fetched.");
});

export const getFounderTokenEconomics = catchAsync(async (req: Request, res: Response) => {
  const value = validateQuery<Range>(rangeQuerySchema, req.query);
  ok(res, await getFounderTokenEconomicsService(value), "Token economics fetched.");
});

export const getFounderFunnel = catchAsync(async (req: Request, res: Response) => {
  validateQuery(emptyQuerySchema, req.query);
  ok(res, await getFounderFunnelService(), "Adoption funnel fetched.");
});

export const getFounderEngagement = catchAsync(async (req: Request, res: Response) => {
  const value = validateQuery<Range>(rangeQuerySchema, req.query);
  ok(res, await getFounderEngagementService(value), "Engagement fetched.");
});

export const getFounderMusic = catchAsync(async (req: Request, res: Response) => {
  const value = validateQuery<Range>(rangeQuerySchema, req.query);
  ok(res, await getFounderMusicService(value), "Music insights fetched.");
});

export const getFounderRetention = catchAsync(async (req: Request, res: Response) => {
  validateQuery(emptyQuerySchema, req.query);
  ok(res, await getFounderRetentionService(), "Retention fetched.");
});

// ─── Customer Success ────────────────────────────────────────────────────────

export const getCsAccounts = catchAsync(async (req: Request, res: Response) => {
  const value = validateQuery<{ search?: string; healthTier?: string }>(
    csAccountsQuerySchema,
    req.query,
  );
  ok(res, await getCsAccountsService(value), "CS accounts fetched.");
});

export const getCsAlerts = catchAsync(async (req: Request, res: Response) => {
  validateQuery(emptyQuerySchema, req.query);
  ok(res, await getCsAlertsService(), "CS alerts fetched.");
});

// ─── Product ─────────────────────────────────────────────────────────────────

export const getProductFunnel = catchAsync(async (req: Request, res: Response) => {
  const value = validateQuery<Range>(rangeQuerySchema, req.query);
  ok(res, await getProductFunnelService(value), "Product funnel fetched.");
});

export const getProductSearchInsights = catchAsync(async (req: Request, res: Response) => {
  const value = validateQuery<Range>(rangeQuerySchema, req.query);
  ok(res, await getProductSearchInsightsService(value), "Search insights fetched.");
});

export const getProductTokenSpend = catchAsync(async (req: Request, res: Response) => {
  const value = validateQuery<Range>(rangeQuerySchema, req.query);
  ok(res, await getProductTokenSpendService(value), "Token spend patterns fetched.");
});

export const getProductBehavior = catchAsync(async (req: Request, res: Response) => {
  const value = validateQuery<Range>(rangeQuerySchema, req.query);
  ok(res, await getProductBehaviorService(value), "Behavior metrics fetched.");
});
