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
  trackDownloadersQuerySchema,
  brandsBreakdownQuerySchema,
  tokenBreakdownQuerySchema,
  brandDetailQuerySchema,
  musicEntityQuerySchema,
  funnelBrandsQuerySchema,
  queryDetailQuerySchema,
  featureBrandsQuerySchema,
  csAccountsQuerySchema,
  csTokenAccountsQuerySchema,
  leadsQuerySchema,
  emptyQuerySchema,
} from "../middlewares/admin-enterprise-analytics.validation";
import {
  getFounderOverviewService,
  getFounderTokenEconomicsService,
  getFounderFunnelService,
  getFounderEngagementService,
  getFounderMusicService,
  getFounderRetentionService,
  getFounderHealthScoresService,
  getFounderTopUsersService,
  getFounderTrackDownloadersService,
  getFounderBrandsBreakdownService,
  getFounderTokenBreakdownService,
  getFounderRenewalBreakdownService,
  getFounderBrandDetailService,
  getFounderMusicEntityService,
  getFounderEngagementBrandsService,
  getFounderFunnelBrandsService,
  getProductQueryDetailService,
  getProductFeatureBrandsService,
  getCsAccountsService,
  getCsAlertsService,
  getCsTokenAccountsService,
  getLeadsService,
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

export const getFounderHealthScores = catchAsync(async (req: Request, res: Response) => {
  validateQuery(emptyQuerySchema, req.query);
  ok(res, await getFounderHealthScoresService(), "Health scores fetched.");
});

export const getFounderTopUsers = catchAsync(async (req: Request, res: Response) => {
  validateQuery(emptyQuerySchema, req.query);
  ok(res, await getFounderTopUsersService(), "Top users fetched.");
});

export const getFounderTrackDownloaders = catchAsync(async (req: Request, res: Response) => {
  const value = validateQuery<Range & { trackCode: string }>(
    trackDownloadersQuerySchema,
    req.query,
  );
  ok(res, await getFounderTrackDownloadersService(value), "Track downloaders fetched.");
});

export const getFounderBrandsBreakdown = catchAsync(async (req: Request, res: Response) => {
  const value = validateQuery<Range & { filter: string }>(
    brandsBreakdownQuerySchema,
    req.query,
  );
  ok(res, await getFounderBrandsBreakdownService(value), "Brands breakdown fetched.");
});

export const getFounderTokenBreakdown = catchAsync(async (req: Request, res: Response) => {
  const value = validateQuery<Range & { metric: string }>(
    tokenBreakdownQuerySchema,
    req.query,
  );
  ok(res, await getFounderTokenBreakdownService(value), "Token breakdown fetched.");
});

export const getFounderRenewalBreakdown = catchAsync(async (req: Request, res: Response) => {
  validateQuery(emptyQuerySchema, req.query);
  ok(res, await getFounderRenewalBreakdownService(), "Renewal breakdown fetched.");
});

export const getFounderBrandDetail = catchAsync(async (req: Request, res: Response) => {
  const value = validateQuery<{ brandId: number }>(brandDetailQuerySchema, req.query);
  const detail = await getFounderBrandDetailService(value);
  if (!detail.brand) throw new AppError("Brand not found.", 404);
  ok(res, detail, "Brand detail fetched.");
});

export const getFounderMusicEntity = catchAsync(async (req: Request, res: Response) => {
  const value = validateQuery<Range & { type: string; name: string }>(
    musicEntityQuerySchema,
    req.query,
  );
  ok(res, await getFounderMusicEntityService(value), "Entity downloads fetched.");
});

export const getFounderEngagementBrands = catchAsync(async (req: Request, res: Response) => {
  const value = validateQuery<Range>(rangeQuerySchema, req.query);
  ok(res, await getFounderEngagementBrandsService(value), "Engagement brands fetched.");
});

export const getFounderFunnelBrands = catchAsync(async (req: Request, res: Response) => {
  const value = validateQuery<Range & { scope: string; stage: string }>(
    funnelBrandsQuerySchema,
    req.query,
  );
  ok(res, await getFounderFunnelBrandsService(value), "Funnel brands fetched.");
});

export const getProductQueryDetail = catchAsync(async (req: Request, res: Response) => {
  const value = validateQuery<Range & { query: string }>(
    queryDetailQuerySchema,
    req.query,
  );
  ok(res, await getProductQueryDetailService(value), "Query detail fetched.");
});

export const getProductFeatureBrands = catchAsync(async (req: Request, res: Response) => {
  const value = validateQuery<Range & { feature: string }>(
    featureBrandsQuerySchema,
    req.query,
  );
  ok(res, await getProductFeatureBrandsService(value), "Feature brands fetched.");
});

// ─── Customer Success ────────────────────────────────────────────────────────

export const getCsAccounts = catchAsync(async (req: Request, res: Response) => {
  const value = validateQuery<{ search?: string; healthTier?: string }>(
    csAccountsQuerySchema,
    req.query,
  );
  ok(res, await getCsAccountsService(value), "CS accounts fetched.");
});

export const getCsTokenAccounts = catchAsync(async (req: Request, res: Response) => {
  const value = validateQuery<{ search?: string; packStatus?: string }>(
    csTokenAccountsQuerySchema,
    req.query,
  );
  ok(res, await getCsTokenAccountsService(value), "Token accounts fetched.");
});

export const getCsAlerts = catchAsync(async (req: Request, res: Response) => {
  validateQuery(emptyQuerySchema, req.query);
  ok(res, await getCsAlertsService(), "CS alerts fetched.");
});

// ─── Leads ───────────────────────────────────────────────────────────────────

export const getLeads = catchAsync(async (req: Request, res: Response) => {
  const value = validateQuery<{ search?: string }>(leadsQuerySchema, req.query);
  ok(res, await getLeadsService(value), "Leads fetched.");
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
