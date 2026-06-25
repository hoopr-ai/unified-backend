import type { Request, Response } from "express";
import {
  catchAsync,
  sendResponse,
  AppError,
} from "../services/helper-service/modules.export";
import { HttpStatusCode } from "../services/dto-service/constants/modules.export";
import {
  listSkusService,
  getSkuFiltersService,
  upsertSkuService,
  bulkUpsertSkusService,
} from "../services/business-service/sku/modules.export";
import { listSkusQuerySchema } from "../middlewares/admin-sku.validation";

// GET /admin/skus — paginated tracks with their current SKU (track pricing).
export const listSkus = catchAsync(async (req: Request, res: Response) => {
  const { value, error } = listSkusQuerySchema.validate(req.query, {
    abortEarly: false,
    stripUnknown: true,
    convert: true,
  });
  if (error) {
    throw new AppError(error.details.map((d) => d.message).join(", "), 400);
  }

  const result = await listSkusService({
    page: value.page,
    limit: value.limit,
    search: value.search,
    ownerId: value.ownerId,
    tier: value.tier,
    status: value.status,
    hasSku: value.hasSku,
  });

  sendResponse(res, {
    status: HttpStatusCode.OK,
    data: result,
    message: "Track SKUs fetched.",
  });
});

// GET /admin/skus/filters — owner list + distinct tiers for the filter UI.
export const getSkuFilters = catchAsync(async (_req: Request, res: Response) => {
  const result = await getSkuFiltersService();
  sendResponse(res, {
    status: HttpStatusCode.OK,
    data: result,
    message: "SKU filters fetched.",
  });
});

// PUT /admin/skus/:trackCode — upsert a single track's SKU.
export const upsertSku = catchAsync(async (req: Request, res: Response) => {
  const trackCode = req.params.trackCode;
  if (!trackCode || typeof trackCode !== "string") {
    throw new AppError("Invalid track code.", 400);
  }

  const result = await upsertSkuService(trackCode, req.body);

  sendResponse(res, {
    status: result.created ? HttpStatusCode.CREATED : HttpStatusCode.OK,
    data: result,
    message: result.created ? "SKU created." : "SKU updated.",
  });
});

// POST /admin/skus/bulk — bulk upsert by explicit codes or by owner/tier filter.
export const bulkUpsertSkus = catchAsync(async (req: Request, res: Response) => {
  const result = await bulkUpsertSkusService(req.body);

  sendResponse(res, {
    status: HttpStatusCode.OK,
    data: result,
    message: `Bulk pricing applied to ${result.matched} track(s).`,
  });
});
