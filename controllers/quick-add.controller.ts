import type { Request, Response } from "express";
import { catchAsync, sendResponse, sendError } from "../services/helper-service/modules.export";
import { ResponseMessages, HttpStatusCode } from "../services/dto-service/modules.export";
import {
  getQuickAddsService,
  getQuickAddByIdOrCodeService,
  createQuickAddService,
  updateQuickAddService,
  deleteQuickAddService,
  uploadQuickAddImageService,
} from "../services/business-service/quick-add/modules.export";
import type { SessionPayload } from "../middlewares/authenticate";
import type {
  CreateQuickAddRequest,
  UpdateQuickAddRequest,
} from "../services/dto-service/quick-add/modules.export";

interface AuthRequest extends Request {
  session?: SessionPayload;
}

// linkParams is a flat string->string bag (router query params), so reject
// nested objects/arrays rather than letting them reach the JSONB column and
// surface as `[object Object]` in a storefront URL.
const validateLinkParams = (value: unknown): Record<string, string> | null | string => {
  if (value === null || value === undefined) return null;
  if (typeof value !== "object" || Array.isArray(value)) {
    return "linkParams must be an object of string values";
  }
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.some(([, v]) => typeof v !== "string")) {
    return "linkParams must be an object of string values";
  }
  return Object.fromEntries(entries) as Record<string, string>;
};

// GET /quick-adds?activeOnly=true — full list for the CMS, active-only for
// anything consumer-facing.
export const getQuickAdds = catchAsync(async (req: Request, res: Response) => {
  const activeOnly = req.query.activeOnly === "true";
  const quickAdds = await getQuickAddsService(activeOnly);
  sendResponse(res, {
    status: HttpStatusCode.OK,
    data: quickAdds,
    message: ResponseMessages.GetQuickAddsSuccess,
  });
});

// GET /quick-adds/:idOrCode — resolves by quickAddCode OR numeric id.
export const getQuickAddByIdOrCode = catchAsync(async (req: Request, res: Response) => {
  const idOrCode = req.params.idOrCode as string;
  const response = await getQuickAddByIdOrCodeService(idOrCode);
  if (!response) {
    return sendError(res, HttpStatusCode.NOT_FOUND, ResponseMessages.QuickAddNotFound);
  }
  sendResponse(res, { status: HttpStatusCode.OK, data: response, message: ResponseMessages.GetQuickAddDetailSuccess });
});

// ─── CMS write-side (admin/music gated in the route) ─────────────────────────

const validateCreateBody = (body: unknown): CreateQuickAddRequest | string => {
  if (!body || typeof body !== "object") return "Request body is required";
  const b = body as Record<string, unknown>;
  if (typeof b.label !== "string" || !b.label.trim()) return "label is required";
  if (b.linkPath !== undefined && typeof b.linkPath !== "string") {
    return "linkPath must be a string";
  }
  const linkParams = validateLinkParams(b.linkParams);
  if (typeof linkParams === "string") return linkParams;
  if (b.isActive !== undefined && typeof b.isActive !== "boolean") {
    return "isActive must be a boolean";
  }
  return {
    label: b.label,
    linkPath: b.linkPath as string | undefined,
    linkParams,
    isActive: b.isActive as boolean | undefined,
  };
};

// POST /quick-adds — create a quick add (quickAddCode generated server-side)
export const createQuickAdd = catchAsync(async (req: AuthRequest, res: Response) => {
  const parsed = validateCreateBody(req.body);
  if (typeof parsed === "string") {
    return sendError(res, HttpStatusCode.BAD_REQUEST, parsed);
  }

  const response = await createQuickAddService(parsed);
  sendResponse(res, { status: HttpStatusCode.CREATED, data: response, message: ResponseMessages.CreateQuickAddSuccess });
});

const validateUpdateBody = (body: unknown): UpdateQuickAddRequest | string => {
  if (!body || typeof body !== "object") return "Request body is required";
  const b = body as Record<string, unknown>;
  if (b.label !== undefined && (typeof b.label !== "string" || !b.label.trim())) {
    return "label must be a non-empty string";
  }
  if (b.linkPath !== undefined && typeof b.linkPath !== "string") {
    return "linkPath must be a string";
  }
  if (b.isActive !== undefined && typeof b.isActive !== "boolean") {
    return "isActive must be a boolean";
  }

  const patch: UpdateQuickAddRequest = {};
  if (b.label !== undefined) patch.label = b.label as string;
  if (b.linkPath !== undefined) patch.linkPath = b.linkPath as string;
  if (b.isActive !== undefined) patch.isActive = b.isActive as boolean;
  if (b.linkParams !== undefined) {
    const linkParams = validateLinkParams(b.linkParams);
    if (typeof linkParams === "string") return linkParams;
    patch.linkParams = linkParams;
  }
  return patch;
};

// PUT /quick-adds/:id — update quick add metadata
export const updateQuickAdd = catchAsync(async (req: AuthRequest, res: Response) => {
  const id = parseInt(req.params.id as string, 10);
  if (!Number.isFinite(id)) {
    return sendError(res, HttpStatusCode.BAD_REQUEST, "Invalid quick add id");
  }
  const parsed = validateUpdateBody(req.body);
  if (typeof parsed === "string") {
    return sendError(res, HttpStatusCode.BAD_REQUEST, parsed);
  }

  const response = await updateQuickAddService(id, parsed);
  if (!response) {
    return sendError(res, HttpStatusCode.NOT_FOUND, ResponseMessages.QuickAddNotFound);
  }
  sendResponse(res, { status: HttpStatusCode.OK, data: response, message: ResponseMessages.UpdateQuickAddSuccess });
});

// DELETE /quick-adds/:id
export const deleteQuickAdd = catchAsync(async (req: AuthRequest, res: Response) => {
  const id = parseInt(req.params.id as string, 10);
  if (!Number.isFinite(id)) {
    return sendError(res, HttpStatusCode.BAD_REQUEST, "Invalid quick add id");
  }
  const deleted = await deleteQuickAddService(id);
  if (!deleted) {
    return sendError(res, HttpStatusCode.NOT_FOUND, ResponseMessages.QuickAddNotFound);
  }
  sendResponse(res, { status: HttpStatusCode.OK, data: { id }, message: ResponseMessages.DeleteQuickAddSuccess });
});

// POST /quick-adds/:id/image — upload (or replace) the tile artwork.
// Expects multipart/form-data with an "image" file (handled by the
// singleImageUpload middleware on the route, which sets req.file).
export const uploadQuickAddImage = catchAsync(async (req: AuthRequest, res: Response) => {
  const id = parseInt(req.params.id as string, 10);
  if (!Number.isFinite(id)) {
    return sendError(res, HttpStatusCode.BAD_REQUEST, "Invalid quick add id");
  }
  if (!req.file) {
    return sendError(res, HttpStatusCode.BAD_REQUEST, "An image file is required (field name: image)");
  }

  const result = await uploadQuickAddImageService(id, {
    buffer: req.file.buffer,
    mimetype: req.file.mimetype,
  });
  if (!result) {
    return sendError(res, HttpStatusCode.NOT_FOUND, ResponseMessages.QuickAddNotFound);
  }
  sendResponse(res, { status: HttpStatusCode.OK, data: result, message: ResponseMessages.UploadQuickAddImageSuccess });
});
