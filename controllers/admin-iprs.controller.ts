import type { Request, Response } from "express";
import type Joi from "joi";
import {
  catchAsync,
  sendResponse,
  AppError,
} from "../services/helper-service/modules.export";
import { HttpStatusCode } from "../services/dto-service/constants/modules.export";
import {
  iprsOverviewQuerySchema,
  iprsLicensesQuerySchema,
  iprsGroupedQuerySchema,
  iprsDealsQuerySchema,
  iprsExportQuerySchema,
  iprsDealsExportQuerySchema,
} from "../middlewares/admin-iprs.validation";
import {
  getIprsOverviewService,
  getIprsTrendService,
  listIprsLicensesService,
  listIprsOwnersService,
  listIprsBrandsService,
  listIprsTracksService,
  listIprsDealsService,
  getIprsFiltersService,
  exportIprsLicensesService,
  exportIprsOwnersService,
  exportIprsBrandsService,
  exportIprsTracksService,
  exportIprsDealsService,
  type IprsFilters,
} from "../services/business-service/iprs/modules.export";

// All endpoints are read-only GETs, so validation happens here on req.query —
// the same pattern as admin-pay-per-track.controller.
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

// Filename is built here, never taken from the request — it emits nothing but
// the fixed base, a date stamp and the extension.
const sendCsv = (res: Response, base: string, body: string) => {
  const filename = `${base}-${new Date().toISOString().slice(0, 10)}.csv`;
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  // Excel reads a UTF-8 CSV as Latin-1 without a BOM, which turns every
  // accented owner name into mojibake on the finance team's machines.
  res.status(HttpStatusCode.OK).send(`﻿${body}`);
};

// ─── Reports ─────────────────────────────────────────────────────────────────

// GET /admin/iprs/overview
export const getIprsOverview = catchAsync(
  async (req: Request, res: Response) => {
    const value = validateQuery<IprsFilters>(iprsOverviewQuerySchema, req.query);
    ok(res, await getIprsOverviewService(value), "IPRS overview fetched.");
  },
);

// GET /admin/iprs/trend
export const getIprsTrend = catchAsync(async (req: Request, res: Response) => {
  const value = validateQuery<IprsFilters>(iprsOverviewQuerySchema, req.query);
  ok(res, await getIprsTrendService(value), "IPRS trend fetched.");
});

// GET /admin/iprs/licenses
export const listIprsLicenses = catchAsync(
  async (req: Request, res: Response) => {
    const value = validateQuery<IprsFilters>(iprsLicensesQuerySchema, req.query);
    ok(res, await listIprsLicensesService(value), "IPRS licenses fetched.");
  },
);

// GET /admin/iprs/owners
export const listIprsOwners = catchAsync(async (req: Request, res: Response) => {
  const value = validateQuery<IprsFilters>(iprsGroupedQuerySchema, req.query);
  ok(res, await listIprsOwnersService(value), "IPRS owners fetched.");
});

// GET /admin/iprs/brands
export const listIprsBrands = catchAsync(async (req: Request, res: Response) => {
  const value = validateQuery<IprsFilters>(iprsGroupedQuerySchema, req.query);
  ok(res, await listIprsBrandsService(value), "IPRS brands fetched.");
});

// GET /admin/iprs/tracks
export const listIprsTracks = catchAsync(async (req: Request, res: Response) => {
  const value = validateQuery<IprsFilters>(iprsGroupedQuerySchema, req.query);
  ok(res, await listIprsTracksService(value), "IPRS tracks fetched.");
});

// GET /admin/iprs/deals
export const listIprsDeals = catchAsync(async (req: Request, res: Response) => {
  const value = validateQuery<IprsFilters>(iprsDealsQuerySchema, req.query);
  ok(res, await listIprsDealsService(value), "IPRS deals fetched.");
});

// GET /admin/iprs/filters
export const getIprsFilters = catchAsync(async (_req: Request, res: Response) => {
  ok(res, await getIprsFiltersService(), "IPRS filter options fetched.");
});

// ─── CSV exports ─────────────────────────────────────────────────────────────

// GET /admin/iprs/licenses/download
export const downloadIprsLicenses = catchAsync(
  async (req: Request, res: Response) => {
    const value = validateQuery<IprsFilters>(iprsExportQuerySchema, req.query);
    sendCsv(res, "iprs-licenses", await exportIprsLicensesService(value));
  },
);

// GET /admin/iprs/owners/download
export const downloadIprsOwners = catchAsync(
  async (req: Request, res: Response) => {
    const value = validateQuery<IprsFilters>(iprsExportQuerySchema, req.query);
    sendCsv(res, "iprs-owners", await exportIprsOwnersService(value));
  },
);

// GET /admin/iprs/brands/download
export const downloadIprsBrands = catchAsync(
  async (req: Request, res: Response) => {
    const value = validateQuery<IprsFilters>(iprsExportQuerySchema, req.query);
    sendCsv(res, "iprs-brands", await exportIprsBrandsService(value));
  },
);

// GET /admin/iprs/tracks/download
export const downloadIprsTracks = catchAsync(
  async (req: Request, res: Response) => {
    const value = validateQuery<IprsFilters>(iprsExportQuerySchema, req.query);
    sendCsv(res, "iprs-tracks", await exportIprsTracksService(value));
  },
);

// GET /admin/iprs/deals/download
export const downloadIprsDeals = catchAsync(
  async (req: Request, res: Response) => {
    const value = validateQuery<IprsFilters>(
      iprsDealsExportQuerySchema,
      req.query,
    );
    sendCsv(res, "iprs-deals", await exportIprsDealsService(value));
  },
);
