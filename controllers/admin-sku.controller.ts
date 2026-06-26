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
  searchSkuArtistsService,
  upsertSkuService,
  bulkUpsertSkusService,
} from "../services/business-service/sku/modules.export";
import {
  listSkusQuerySchema,
  artistSearchQuerySchema,
} from "../middlewares/admin-sku.validation";

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

  // artistIds arrives comma-separated on the GET query.
  const artistIds: string[] | undefined =
    typeof value.artistIds === "string" && value.artistIds.trim().length > 0
      ? value.artistIds
          .split(",")
          .map((s: string) => s.trim())
          .filter(Boolean)
      : undefined;

  const result = await listSkusService({
    page: value.page,
    limit: value.limit,
    search: value.search,
    ownerId: value.ownerId,
    tier: value.tier,
    status: value.status,
    vocals: value.vocals,
    artistIds,
    hasSku: value.hasSku,
  });

  sendResponse(res, {
    status: HttpStatusCode.OK,
    data: result,
    message: "Track SKUs fetched.",
  });
});

// GET /admin/skus/filters — owner list + distinct tiers/statuses for the filter UI.
export const getSkuFilters = catchAsync(async (_req: Request, res: Response) => {
  const result = await getSkuFiltersService();
  sendResponse(res, {
    status: HttpStatusCode.OK,
    data: result,
    message: "SKU filters fetched.",
  });
});

// GET /admin/skus/artists?search= — typeahead for the artist filter.
export const searchSkuArtists = catchAsync(
  async (req: Request, res: Response) => {
    const { value, error } = artistSearchQuerySchema.validate(req.query, {
      abortEarly: false,
      stripUnknown: true,
      convert: true,
    });
    if (error) {
      throw new AppError(error.details.map((d) => d.message).join(", "), 400);
    }

    const artists = await searchSkuArtistsService(value.search ?? "", value.limit);
    sendResponse(res, {
      status: HttpStatusCode.OK,
      data: { artists },
      message: "Artists fetched.",
    });
  },
);

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
