import type { Request, Response } from "express";
import {
  getRailsService,
  getRailByKeyService,
  upsertRailService,
  UpsertRailRequest,
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

// GET /rails?brandId=123 - Get all visible rails for a brand (or defaults)
export const getRails = catchAsync(async (req: AuthRequest, res: Response) => {
  const brandId = parseBrandId(req.query.brandId);
  const userId = req.session?.userId;

  const rails = await getRailsService(brandId, userId);

  sendResponse(res, {
    status: HttpStatusCode.OK,
    data: rails,
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
    const q = b.query as { filterIds?: unknown } | undefined;
    if (!q || !Array.isArray(q.filterIds) || q.filterIds.length === 0) {
      return "query.filterIds is required for QUERY";
    }
  } else if (sourceType === RailSourceType.AI_QUERY) {
    if (type !== RailType.TRACKS) return "AI_QUERY sourceType is only valid for TRACKS";
    const a = b.aiQuery as { url?: unknown } | undefined;
    if (!a || typeof a.url !== "string" || !a.url) {
      return "aiQuery.url is required for AI_QUERY";
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
