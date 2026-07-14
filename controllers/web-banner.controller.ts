import type { Request, Response } from "express";
import { catchAsync, sendResponse, sendError } from "../services/helper-service/modules.export";
import { ResponseMessages, HttpStatusCode } from "../services/dto-service/modules.export";
import {
  getWebBannersService,
  getWebBannerByIdOrCodeService,
  createWebBannerService,
  updateWebBannerService,
  deleteWebBannerService,
  uploadWebBannerImageService,
} from "../services/business-service/web-banner/modules.export";
import type { SessionPayload } from "../middlewares/authenticate";
import type {
  CreateWebBannerRequest,
  UpdateWebBannerRequest,
  WebBannerImageVariant,
} from "../services/dto-service/web-banner/modules.export";

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

// GET /web-banners?activeOnly=true
export const getWebBanners = catchAsync(async (req: Request, res: Response) => {
  const activeOnly = req.query.activeOnly === "true";
  const banners = await getWebBannersService(activeOnly);
  sendResponse(res, {
    status: HttpStatusCode.OK,
    data: banners,
    message: ResponseMessages.GetWebBannersSuccess,
  });
});

// GET /web-banners/:idOrCode
export const getWebBannerByIdOrCode = catchAsync(async (req: Request, res: Response) => {
  const idOrCode = req.params.idOrCode as string;
  const response = await getWebBannerByIdOrCodeService(idOrCode);
  if (!response) {
    return sendError(res, HttpStatusCode.NOT_FOUND, ResponseMessages.WebBannerNotFound);
  }
  sendResponse(res, { status: HttpStatusCode.OK, data: response, message: ResponseMessages.GetWebBannerDetailSuccess });
});

// ─── CMS write-side (admin/music gated in the route) ─────────────────────────

const validateCreateBody = (body: unknown): CreateWebBannerRequest | string => {
  if (!body || typeof body !== "object") return "Request body is required";
  const b = body as Record<string, unknown>;
  if (typeof b.title !== "string" || !b.title.trim()) return "title is required";
  if (b.linkPath !== undefined && typeof b.linkPath !== "string") {
    return "linkPath must be a string";
  }
  const linkParams = validateLinkParams(b.linkParams);
  if (typeof linkParams === "string") return linkParams;
  if (b.isActive !== undefined && typeof b.isActive !== "boolean") {
    return "isActive must be a boolean";
  }
  return {
    title: b.title,
    linkPath: b.linkPath as string | undefined,
    linkParams,
    isActive: b.isActive as boolean | undefined,
  };
};

// POST /web-banners — create a banner (bannerCode generated server-side)
export const createWebBanner = catchAsync(async (req: AuthRequest, res: Response) => {
  const parsed = validateCreateBody(req.body);
  if (typeof parsed === "string") {
    return sendError(res, HttpStatusCode.BAD_REQUEST, parsed);
  }

  const response = await createWebBannerService(parsed);
  sendResponse(res, { status: HttpStatusCode.CREATED, data: response, message: ResponseMessages.CreateWebBannerSuccess });
});

const validateUpdateBody = (body: unknown): UpdateWebBannerRequest | string => {
  if (!body || typeof body !== "object") return "Request body is required";
  const b = body as Record<string, unknown>;
  if (b.title !== undefined && (typeof b.title !== "string" || !b.title.trim())) {
    return "title must be a non-empty string";
  }
  if (b.linkPath !== undefined && typeof b.linkPath !== "string") {
    return "linkPath must be a string";
  }
  if (b.isActive !== undefined && typeof b.isActive !== "boolean") {
    return "isActive must be a boolean";
  }

  const patch: UpdateWebBannerRequest = {};
  if (b.title !== undefined) patch.title = b.title as string;
  if (b.linkPath !== undefined) patch.linkPath = b.linkPath as string;
  if (b.isActive !== undefined) patch.isActive = b.isActive as boolean;
  if (b.linkParams !== undefined) {
    const linkParams = validateLinkParams(b.linkParams);
    if (typeof linkParams === "string") return linkParams;
    patch.linkParams = linkParams;
  }
  return patch;
};

// PUT /web-banners/:id
export const updateWebBanner = catchAsync(async (req: AuthRequest, res: Response) => {
  const id = parseInt(req.params.id as string, 10);
  if (!Number.isFinite(id)) {
    return sendError(res, HttpStatusCode.BAD_REQUEST, "Invalid banner id");
  }
  const parsed = validateUpdateBody(req.body);
  if (typeof parsed === "string") {
    return sendError(res, HttpStatusCode.BAD_REQUEST, parsed);
  }

  const response = await updateWebBannerService(id, parsed);
  if (!response) {
    return sendError(res, HttpStatusCode.NOT_FOUND, ResponseMessages.WebBannerNotFound);
  }
  sendResponse(res, { status: HttpStatusCode.OK, data: response, message: ResponseMessages.UpdateWebBannerSuccess });
});

// DELETE /web-banners/:id
export const deleteWebBanner = catchAsync(async (req: AuthRequest, res: Response) => {
  const id = parseInt(req.params.id as string, 10);
  if (!Number.isFinite(id)) {
    return sendError(res, HttpStatusCode.BAD_REQUEST, "Invalid banner id");
  }
  const deleted = await deleteWebBannerService(id);
  if (!deleted) {
    return sendError(res, HttpStatusCode.NOT_FOUND, ResponseMessages.WebBannerNotFound);
  }
  sendResponse(res, { status: HttpStatusCode.OK, data: { id }, message: ResponseMessages.DeleteWebBannerSuccess });
});

// POST /web-banners/:id/image?variant=desktop|mobile — upload (or replace) the
// artwork. Expects multipart/form-data with an "image" file (singleImageUpload
// on the route sets req.file). Defaults to the desktop crop.
export const uploadWebBannerImage = catchAsync(async (req: AuthRequest, res: Response) => {
  const id = parseInt(req.params.id as string, 10);
  if (!Number.isFinite(id)) {
    return sendError(res, HttpStatusCode.BAD_REQUEST, "Invalid banner id");
  }

  const variantRaw = typeof req.query.variant === "string" ? req.query.variant : "desktop";
  if (variantRaw !== "desktop" && variantRaw !== "mobile") {
    return sendError(res, HttpStatusCode.BAD_REQUEST, "variant must be 'desktop' or 'mobile'");
  }
  const variant = variantRaw as WebBannerImageVariant;

  if (!req.file) {
    return sendError(res, HttpStatusCode.BAD_REQUEST, "An image file is required (field name: image)");
  }

  const result = await uploadWebBannerImageService(id, variant, {
    buffer: req.file.buffer,
    mimetype: req.file.mimetype,
  });
  if (!result) {
    return sendError(res, HttpStatusCode.NOT_FOUND, ResponseMessages.WebBannerNotFound);
  }
  sendResponse(res, { status: HttpStatusCode.OK, data: result, message: ResponseMessages.UploadWebBannerImageSuccess });
});
