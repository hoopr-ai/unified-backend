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
} from "../services/business-service/modules.export";
import {
  catchAsync,
  sendResponse,
} from "../services/helper-service/modules.export";
import { ResponseMessages } from "../services/dto-service/constants/response-messages";
import {
  HttpStatusCode,
  RailType,
  RailSourceType,
} from "../services/dto-service/modules.export";
import type { SessionPayload } from "../middlewares/authenticate";

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
  const userId = req.session?.userId;
  const pageName = typeof req.query.pageName === "string" ? req.query.pageName : "HOME";

  const rails = await getRailsService(brandId, userId, pageName);

  sendResponse(res, {
    status: HttpStatusCode.OK,
    data: rails,
    message: ResponseMessages.GetRailsSuccess,
  });
});

// GET /rails/batch?brandId=123&pageName=home&page=1&limit=5&railItemLimit=10 - Get rails in batches (paginated)
export const getRailsBatch = catchAsync(async (req: AuthRequest, res: Response) => {
  const brandId = parseBrandId(req.query.brandId);
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

  const result = await getRailsPaginatedService(brandId, userId, pageName, page, limit, railItemLimit);

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
    console.log("hhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhh");
    
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
