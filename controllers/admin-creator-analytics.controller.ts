import type { Request, Response } from "express";
import type Joi from "joi";
import {
  catchAsync,
  sendResponse,
  AppError,
} from "../services/helper-service/modules.export";
import { HttpStatusCode } from "../services/dto-service/constants/modules.export";
import {
  creatorRangeQuerySchema,
  creatorBreakdownQuerySchema,
  creatorDetailQuerySchema,
  creatorEmptyQuerySchema,
} from "../middlewares/admin-creator-analytics.validation";
import {
  getFunnelService,
  getFunnelTimeseriesService,
  getPlatformService,
  getBreakdownService,
  getMetaService,
  getDetailService,
  getDetailExportService,
  type CreatorFilters,
  type DetailQuery,
} from "../services/business-service/creator-analytics/modules.export";

// Read-only endpoints backing internal-fe's "Creator Users & Analytics"
// dashboard. All GETs, so validation runs against req.query — the same shape as
// admin-native-analytics.controller.ts, whose conventions this file follows
// deliberately: the two dashboards sit next to each other in the CMS and are
// read by the same people.

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

const filtersOf = (req: Request): CreatorFilters =>
  validate<CreatorFilters>(creatorRangeQuerySchema, req.query);

export const getCreatorFunnel = catchAsync(async (req: Request, res: Response) => {
  const data = await getFunnelService(filtersOf(req));
  return ok(res, data, "Creator funnel fetched successfully.");
});

export const getCreatorFunnelTimeseries = catchAsync(
  async (req: Request, res: Response) => {
    const data = await getFunnelTimeseriesService(filtersOf(req));
    return ok(res, data, "Creator funnel timeseries fetched successfully.");
  },
);

export const getCreatorPlatform = catchAsync(async (req: Request, res: Response) => {
  const data = await getPlatformService(filtersOf(req));
  return ok(res, data, "Platform activity fetched successfully.");
});

export const getCreatorBreakdown = catchAsync(async (req: Request, res: Response) => {
  const filters = validate<Parameters<typeof getBreakdownService>[0]>(
    creatorBreakdownQuerySchema,
    req.query,
  );
  const data = await getBreakdownService(filters);
  return ok(res, data, "Breakdown fetched successfully.");
});

export const getCreatorMeta = catchAsync(async (req: Request, res: Response) => {
  validate(creatorEmptyQuerySchema, req.query);
  const data = await getMetaService();
  return ok(res, data, "Metric catalogue fetched successfully.");
});

export const getCreatorDetail = catchAsync(async (req: Request, res: Response) => {
  const filters = validate<DetailQuery>(creatorDetailQuerySchema, req.query);
  const data = await getDetailService(filters);
  return ok(res, data, "Detail rows fetched successfully.");
});

/**
 * The same rows as a CSV.
 *
 * `filename` comes from the service and is built from a registry key plus the
 * two validated dates, so nothing operator-influenced reaches the
 * Content-Disposition header — the same rule admin-whitelisting.controller.ts
 * states at its own csvFilename().
 */
export const exportCreatorDetail = catchAsync(async (req: Request, res: Response) => {
  const filters = validate<DetailQuery>(creatorDetailQuerySchema, req.query);
  const { filename, csv } = await getDetailExportService(filters);
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  // Excel reads a UTF-8 CSV as Latin-1 without a BOM, which turns every creator
  // name carrying an accent into mojibake on the ops team's machines.
  res.status(HttpStatusCode.OK).send(`﻿${csv}`);
});
