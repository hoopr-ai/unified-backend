import type { Request, Response } from "express";
import {
  getRailsService,
  getRailsPaginatedService,
  getRailByKeyService,
  upsertRailService,
  UpsertRailRequest,
  deleteRailService,
  editRailItemsService,
  EditRailItemsRequest,
  reorderRailsService,
  ReorderRailsRequest,
} from "../services/business-service/modules.export";
import { copyRailToPages } from "../services/persistence-service/rail/rail.persistence.service";
import { triggerManualRefresh } from "../services/scheduler-service";
import {
  catchAsync,
  sendResponse,
} from "../services/helper-service/modules.export";
import { ResponseMessages } from "../services/dto-service/constants/response-messages";
import {
  HttpStatusCode,
  RailType,
  RailSourceType,
  PageName,
} from "../services/dto-service/modules.export";
import type { SessionPayload } from "../middlewares/authenticate";
import { findUserById } from "../services/persistence-service/exports";

interface AuthRequest extends Request {
  session?: SessionPayload;
}

const parseBrandId = (raw: unknown): number | undefined => {
  if (raw == null) return undefined;
  const str = Array.isArray(raw) ? raw[0] : raw;
  const num = Number(str);
  return Number.isFinite(num) && num > 0 ? num : undefined;
};

// GET /rails?brandId=123&pageName=home - Get all visible rails for a brand (or defaults)
export const getRails = catchAsync(async (req: AuthRequest, res: Response) => {
  const brandId = parseBrandId(req.query.brandId);
  const userId = parseBrandId(req.session?.userId); // Reusing parseBrandId to parse userId from session, will return undefined if invalid
  const pageName = typeof req.query.pageName === "string" ? req.query.pageName : "HOME";

  // Get the logged-in user's brandId for brand-specific recommendations
  const user = userId ? await findUserById(userId) : null;

  const rails = await getRailsService(brandId, userId, pageName);

  sendResponse(res, {
    status: HttpStatusCode.OK,
    data: rails,
    message: ResponseMessages.GetRailsSuccess,
  });
});

// GET /rails/batch?brandId=123&pageName=home&page=1&limit=5&railItemLimit=10 - Get rails in batches (paginated)
export const getRailsBatch = catchAsync(async (req: AuthRequest, res: Response) => {
  const userId = req.session?.userId;
  const pageName = typeof req.query.pageName === "string" ? req.query.pageName : "HOME";

  // Parse pagination params with defaults
  const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string, 10) || 10));
  // Parse rail item limit (max items per rail, 0 or undefined means no limit)
  const railItemLimitRaw = parseInt(req.query.railItemLimit as string, 10);
  const railItemLimit = Number.isFinite(railItemLimitRaw) && railItemLimitRaw > 0
    ? Math.min(200, railItemLimitRaw)
    : undefined;

  // Get the logged-in user's brandId for brand-specific recommendations
  const user = userId ? await findUserById(userId) : null;
  const userBrandId = user?.brandId;
  const result = await getRailsPaginatedService(userBrandId, userId, pageName, page, limit, railItemLimit);

  sendResponse(res, {
    status: HttpStatusCode.OK,
    data: result,
    message: ResponseMessages.GetRailsSuccess,
  });
});

// GET /rails/:key?brandId=123 - Get a single rail by key
export const getRailByKey = catchAsync(
  async (req: AuthRequest, res: Response) => {
    const key = req.params.key as string;
    const brandId = parseBrandId(req.query.brandId);
    const userId = req.session?.userId;

    const rail = await getRailByKeyService(key, brandId, userId);

    if (!rail) {
      sendResponse(res, {
        status: HttpStatusCode.NOT_FOUND,
        data: null,
        message: ResponseMessages.RailNotFound,
      });
      return;
    }

    sendResponse(res, {
      status: HttpStatusCode.OK,
      data: rail,
      message: ResponseMessages.GetRailSuccess,
    });
  },
);

const VALID_RAIL_TYPES = new Set<string>(Object.values(RailType));
const VALID_SOURCE_TYPES = new Set<string>(Object.values(RailSourceType));
const VALID_PAGE_NAMES = new Set<string>(Object.values(PageName));

const validateUpsertBody = (body: unknown): UpsertRailRequest | string => {
  if (!body || typeof body !== "object") return "Request body is required";
  const b = body as Record<string, unknown>;

  if (typeof b.key !== "string" || !b.key.trim()) return "key is required";
  if (typeof b.title !== "string" || !b.title.trim()) return "title is required";
  if (typeof b.type !== "string" || !VALID_RAIL_TYPES.has(b.type)) {
    return `type must be one of ${Array.from(VALID_RAIL_TYPES).join(", ")}`;
  }
  if (typeof b.sourceType !== "string" || !VALID_SOURCE_TYPES.has(b.sourceType)) {
    return `sourceType must be one of ${Array.from(VALID_SOURCE_TYPES).join(", ")}`;
  }

  // Validate pageNames if provided (optional, defaults to [HOME])
  if (b.pageNames !== undefined) {
    if (!Array.isArray(b.pageNames)) {
      return "pageNames must be an array";
    }
    for (const pn of b.pageNames) {
      if (typeof pn !== "string" || !VALID_PAGE_NAMES.has(pn)) {
        return `pageNames must contain valid values: ${Array.from(VALID_PAGE_NAMES).join(", ")}`;
      }
    }
  }

  const type = b.type as RailType;
  const sourceType = b.sourceType as RailSourceType;

  if (sourceType === RailSourceType.MANUAL) {
    if (!Array.isArray(b.itemCodes)) return "itemCodes array is required for MANUAL";
  } else if (sourceType === RailSourceType.QUERY) {
    if (type !== RailType.TRACKS) return "QUERY sourceType is only valid for TRACKS";
    const q = b.query as {
      filterIds?: unknown;
      popular?: unknown;
      trending?: unknown;
      newOnHoopr?: unknown;
      movie?: unknown;
      campaign?: unknown;
      type?: unknown;
      ownerCode?: unknown;
      releaseYearFrom?: unknown;
      releaseYearTo?: unknown;
    } | undefined;
    if (!q) {
      return "query object is required for QUERY sourceType";
    }
    const hasFilterIds = Array.isArray(q.filterIds) && q.filterIds.length > 0;
    const hasTrackFilters = q.popular === true || q.trending === true ||
      q.newOnHoopr === true || q.movie !== undefined || q.campaign === true ||
      Array.isArray(q.type) || Array.isArray(q.ownerCode) ||
      q.releaseYearFrom !== undefined || q.releaseYearTo !== undefined;
    if (!hasFilterIds && !hasTrackFilters) {
      return "query must have either filterIds or track filter parameters (popular, trending, newOnHoopr, movie, campaign, type, ownerCode, releaseYearFrom, releaseYearTo)";
    }
  } else if (sourceType === RailSourceType.AI_QUERY) {
    if (type !== RailType.TRACKS) return "AI_QUERY sourceType is only valid for TRACKS";
    const a = b.aiQuery as {
      queryType?: unknown;
      url?: unknown;
      q?: unknown;
      filters?: unknown;
    } | undefined;
    if (!a) {
      return "aiQuery is required for AI_QUERY";
    }
    const validQueryTypes = ['TRENDING', 'POPULAR', 'FILTERED', 'NEW_AGE_ICONS'];
    const hasQueryType = typeof a.queryType === 'string' && validQueryTypes.includes(a.queryType);
    const hasLegacyUrl = typeof a.url === 'string' && a.url.length > 0;
    if (!hasQueryType && !hasLegacyUrl) {
      return "aiQuery.queryType (TRENDING, POPULAR, FILTERED, or NEW_AGE_ICONS) or aiQuery.url is required for AI_QUERY";
    }
  }

  return b as unknown as UpsertRailRequest;
};

// POST /rails - Create or update a rail (upsert on key + brandId)
export const upsertRail = catchAsync(
  async (req: AuthRequest, res: Response) => {
    const parsed = validateUpsertBody(req.body);
    if (typeof parsed === "string") {
      sendResponse(res, {
        status: HttpStatusCode.BAD_REQUEST,
        data: null,
        message: parsed,
      });
      return;
    }

    const result = await upsertRailService(parsed);

    sendResponse(res, {
      status: HttpStatusCode.OK,
      data: result,
      message: ResponseMessages.UpsertRailSuccess,
    });
  },
);

// DELETE /rails/:railId - Hard delete a rail and its items
export const deleteRail = catchAsync(
  async (req: AuthRequest, res: Response) => {
    const railId = Number(req.params.railId);
    if (!Number.isFinite(railId) || railId <= 0) {
      sendResponse(res, {
        status: HttpStatusCode.BAD_REQUEST,
        data: null,
        message: "Invalid railId",
      });
      return;
    }

    const deleted = await deleteRailService(railId);

    if (!deleted) {
      sendResponse(res, {
        status: HttpStatusCode.NOT_FOUND,
        data: null,
        message: ResponseMessages.RailNotFound,
      });
      return;
    }

    sendResponse(res, {
      status: HttpStatusCode.OK,
      data: { railId },
      message: ResponseMessages.DeleteRailSuccess,
    });
  },
);

// Validate edit rail items request body
const validateEditRailItemsBody = (body: unknown): EditRailItemsRequest | string => {
  if (!body || typeof body !== "object") return "Request body is required";
  const b = body as Record<string, unknown>;

  if (!Array.isArray(b.items)) return "items array is required";

  for (let i = 0; i < b.items.length; i++) {
    const item = b.items[i] as Record<string, unknown>;
    if (!item || typeof item !== "object") {
      return `items[${i}] must be an object`;
    }
    if (typeof item.itemCode !== "string" || !item.itemCode.trim()) {
      return `items[${i}].itemCode is required`;
    }
    if (typeof item.order !== "number" || !Number.isFinite(item.order)) {
      return `items[${i}].order must be a number`;
    }
    if (item.id !== undefined && (typeof item.id !== "number" || !Number.isFinite(item.id))) {
      return `items[${i}].id must be a number if provided`;
    }
    if (item.isLocked !== undefined && typeof item.isLocked !== "boolean") {
      return `items[${i}].isLocked must be a boolean if provided`;
    }
  }

  return b as unknown as EditRailItemsRequest;
};

// PATCH /rails/:railId/items - Edit rail items (delete, freeze, reorder, add)
export const editRailItems = catchAsync(
  async (req: AuthRequest, res: Response) => {
    const railId = Number(req.params.railId);
    if (!Number.isFinite(railId) || railId <= 0) {
      sendResponse(res, {
        status: HttpStatusCode.BAD_REQUEST,
        data: null,
        message: "Invalid railId",
      });
      return;
    }

    const parsed = validateEditRailItemsBody(req.body);
    if (typeof parsed === "string") {
      sendResponse(res, {
        status: HttpStatusCode.BAD_REQUEST,
        data: null,
        message: parsed,
      });
      return;
    }

    const result = await editRailItemsService(railId, parsed);

    if (!result) {
      sendResponse(res, {
        status: HttpStatusCode.NOT_FOUND,
        data: null,
        message: ResponseMessages.RailNotFound,
      });
      return;
    }

    sendResponse(res, {
      status: HttpStatusCode.OK,
      data: result,
      message: ResponseMessages.EditRailItemsSuccess,
    });
  },
);

// Validate reorder rails request body
const validateReorderRailsBody = (body: unknown): ReorderRailsRequest | string => {
  if (!body || typeof body !== "object") return "Request body is required";
  const b = body as Record<string, unknown>;

  // Validate pageName (required for page-wise reordering)
  if (typeof b.pageName !== "string" || !VALID_PAGE_NAMES.has(b.pageName)) {
    return `pageName is required and must be one of: ${Array.from(VALID_PAGE_NAMES).join(", ")}`;
  }

  if (!Array.isArray(b.railOrders)) return "railOrders array is required";

  for (let i = 0; i < b.railOrders.length; i++) {
    const item = b.railOrders[i] as Record<string, unknown>;
    if (!item || typeof item !== "object") {
      return `railOrders[${i}] must be an object`;
    }
    if (typeof item.id !== "number" || !Number.isFinite(item.id) || item.id <= 0) {
      return `railOrders[${i}].id must be a positive number`;
    }
    if (typeof item.order !== "number" || !Number.isFinite(item.order)) {
      return `railOrders[${i}].order must be a number`;
    }
  }

  return b as unknown as ReorderRailsRequest;
};

// PATCH /rails/reorder - Reorder rails (bulk update order values)
export const reorderRails = catchAsync(
  async (req: AuthRequest, res: Response) => {
    const parsed = validateReorderRailsBody(req.body);
    if (typeof parsed === "string") {
      sendResponse(res, {
        status: HttpStatusCode.BAD_REQUEST,
        data: null,
        message: parsed,
      });
      return;
    }

    const result = await reorderRailsService(parsed);

    sendResponse(res, {
      status: HttpStatusCode.OK,
      data: result,
      message: ResponseMessages.ReorderRailsSuccess,
    });
  },
);

// Validate copy rail request body
const validateCopyRailBody = (body: unknown): { railId: number; targetPageNames: PageName[]; brandId?: number } | string => {
  if (!body || typeof body !== "object") return "Request body is required";
  const b = body as Record<string, unknown>;

  if (typeof b.railId !== "number" || !Number.isFinite(b.railId) || b.railId <= 0) {
    return "railId must be a positive number";
  }

  if (!Array.isArray(b.targetPageNames) || b.targetPageNames.length === 0) {
    return "targetPageNames array is required and must not be empty";
  }

  for (const pn of b.targetPageNames) {
    if (typeof pn !== "string" || !VALID_PAGE_NAMES.has(pn)) {
      return `targetPageNames must contain valid values: ${Array.from(VALID_PAGE_NAMES).join(", ")}`;
    }
  }

  const brandId = b.brandId !== undefined ? Number(b.brandId) : undefined;
  if (brandId !== undefined && (!Number.isFinite(brandId) || brandId <= 0)) {
    return "brandId must be a positive number if provided";
  }

  return {
    railId: b.railId as number,
    targetPageNames: b.targetPageNames as PageName[],
    brandId,
  };
};

// POST /rails/copy - Copy a rail to multiple target pages
export const copyRail = catchAsync(
  async (req: AuthRequest, res: Response) => {
    const parsed = validateCopyRailBody(req.body);
    if (typeof parsed === "string") {
      sendResponse(res, {
        status: HttpStatusCode.BAD_REQUEST,
        data: null,
        message: parsed,
      });
      return;
    }

    try {
      const result = await copyRailToPages(
        parsed.railId,
        parsed.targetPageNames,
        parsed.brandId,
      );

      sendResponse(res, {
        status: HttpStatusCode.OK,
        data: result,
        message: `Rail copied to ${result.copiedTo.length} page(s)${result.skipped.length > 0 ? `, ${result.skipped.length} skipped` : ""}`,
      });
    } catch (err) {
      sendResponse(res, {
        status: HttpStatusCode.NOT_FOUND,
        data: null,
        message: (err as Error).message,
      });
    }
  },
);

// POST /rails/refresh - Trigger manual rail refresh job
export const refreshRails = catchAsync(
  async (req: AuthRequest, res: Response) => {
    await triggerManualRefresh();

    sendResponse(res, {
      status: HttpStatusCode.OK,
      data: { message: "Rail refresh job queued" },
      message: "Rail refresh job has been queued successfully",
    });
  },
);
