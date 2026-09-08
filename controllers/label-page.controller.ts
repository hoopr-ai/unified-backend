import type { Request, Response } from "express";
import { catchAsync, sendResponse, sendError } from "../services/helper-service/modules.export";
import { ResponseMessages, HttpStatusCode } from "../services/dto-service/modules.export";
import {
  getLabelPagesService,
  getLabelPageBySlugOrIdService,
  createLabelPageService,
  updateLabelPageService,
  deleteLabelPageService,
  uploadLabelPageImageService,
} from "../services/business-service/label-page/modules.export";
import {
  recordUtmArrival,
  parseUtmTags,
  UtmContext,
} from "../services/business-service/attribution/modules.export";
import type { SessionPayload } from "../middlewares/authenticate";
import type {
  CreateLabelPageRequest,
  UpdateLabelPageRequest,
  LabelPageImageVariant,
} from "../services/dto-service/label-page/modules.export";

interface AuthRequest extends Request {
  session?: SessionPayload;
}

// GET /label-pages?activeOnly=true
export const getLabelPages = catchAsync(async (req: AuthRequest, res: Response) => {
  const activeOnly = req.query.activeOnly === "true";

  // enterprise-fe puts the landing URL's utm_* tags on the query string here
  // (they go in the body on POST /tracks), so a visit that opens a label page
  // is attributed even before any catalogue call goes out.
  recordUtmArrival(
    UtmContext.LABEL_PAGE_LIST,
    parseUtmTags(req.query as Record<string, unknown>),
    req,
    req.session,
  );

  const pages = await getLabelPagesService(activeOnly);
  sendResponse(res, {
    status: HttpStatusCode.OK,
    data: pages,
    message: ResponseMessages.GetLabelPagesSuccess,
  });
});

// GET /label-pages/:idOrSlug
export const getLabelPageBySlugOrId = catchAsync(async (req: Request, res: Response) => {
  const idOrSlug = req.params.idOrSlug as string;
  const response = await getLabelPageBySlugOrIdService(idOrSlug);
  if (!response) {
    return sendError(res, HttpStatusCode.NOT_FOUND, ResponseMessages.LabelPageNotFound);
  }
  sendResponse(res, { status: HttpStatusCode.OK, data: response, message: ResponseMessages.GetLabelPageDetailSuccess });
});

// ─── CMS write-side (admin/music gated in the route) ─────────────────────────

// Optional free text that is also explicitly clearable: null and "" both mean
// "blank this out", anything else must be a string.
const validateNullableText = (value: unknown, field: string): string | null | undefined => {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") return `${field} must be a string or null`;
  return value;
};

const validateCreateBody = (body: unknown): CreateLabelPageRequest | string => {
  if (!body || typeof body !== "object") return "Request body is required";
  const b = body as Record<string, unknown>;
  if (typeof b.ownerId !== "string" || !b.ownerId.trim()) return "ownerId is required";
  if (b.title !== undefined && (typeof b.title !== "string" || !b.title.trim())) {
    return "title must be a non-empty string";
  }
  if (b.slug !== undefined && (typeof b.slug !== "string" || !b.slug.trim())) {
    return "slug must be a non-empty string";
  }
  if (b.isActive !== undefined && typeof b.isActive !== "boolean") {
    return "isActive must be a boolean";
  }

  const parsed: CreateLabelPageRequest = { ownerId: b.ownerId.trim() };
  if (b.title !== undefined) parsed.title = b.title as string;
  if (b.slug !== undefined) parsed.slug = b.slug as string;
  if (b.isActive !== undefined) parsed.isActive = b.isActive as boolean;

  for (const field of ["description", "seoTitle", "seoDescription"] as const) {
    const value = validateNullableText(b[field], field);
    if (typeof value === "string" && value.endsWith("must be a string or null")) {
      return value;
    }
    if (value !== undefined) parsed[field] = value as string | null;
  }
  return parsed;
};

// POST /label-pages — create a page for one label (slug generated server-side
// unless the caller supplies one).
export const createLabelPage = catchAsync(async (req: AuthRequest, res: Response) => {
  const parsed = validateCreateBody(req.body);
  if (typeof parsed === "string") {
    return sendError(res, HttpStatusCode.BAD_REQUEST, parsed);
  }

  const result = await createLabelPageService(parsed);
  if (result === "OWNER_NOT_FOUND") {
    return sendError(res, HttpStatusCode.NOT_FOUND, ResponseMessages.LabelPageOwnerNotFound);
  }
  if (result === "OWNER_CODE_TOO_LONG") {
    return sendError(res, HttpStatusCode.BAD_REQUEST, ResponseMessages.LabelPageOwnerCodeTooLong);
  }
  if (result === "PAGE_ALREADY_EXISTS") {
    return sendError(res, HttpStatusCode.CONFLICT, ResponseMessages.LabelPageAlreadyExists);
  }

  sendResponse(res, { status: HttpStatusCode.CREATED, data: result, message: ResponseMessages.CreateLabelPageSuccess });
});

const validateUpdateBody = (body: unknown): UpdateLabelPageRequest | string => {
  if (!body || typeof body !== "object") return "Request body is required";
  const b = body as Record<string, unknown>;
  if (b.title !== undefined && (typeof b.title !== "string" || !b.title.trim())) {
    return "title must be a non-empty string";
  }
  if (b.slug !== undefined && (typeof b.slug !== "string" || !b.slug.trim())) {
    return "slug must be a non-empty string";
  }
  if (b.isActive !== undefined && typeof b.isActive !== "boolean") {
    return "isActive must be a boolean";
  }

  const patch: UpdateLabelPageRequest = {};
  if (b.title !== undefined) patch.title = b.title as string;
  if (b.slug !== undefined) patch.slug = b.slug as string;
  if (b.isActive !== undefined) patch.isActive = b.isActive as boolean;

  for (const field of ["description", "seoTitle", "seoDescription"] as const) {
    const value = validateNullableText(b[field], field);
    if (typeof value === "string" && value.endsWith("must be a string or null")) {
      return value;
    }
    if (value !== undefined) patch[field] = value as string | null;
  }
  return patch;
};

// PUT /label-pages/:id
export const updateLabelPage = catchAsync(async (req: AuthRequest, res: Response) => {
  const id = parseInt(req.params.id as string, 10);
  if (!Number.isFinite(id)) {
    return sendError(res, HttpStatusCode.BAD_REQUEST, "Invalid label page id");
  }
  const parsed = validateUpdateBody(req.body);
  if (typeof parsed === "string") {
    return sendError(res, HttpStatusCode.BAD_REQUEST, parsed);
  }

  const response = await updateLabelPageService(id, parsed);
  if (!response) {
    return sendError(res, HttpStatusCode.NOT_FOUND, ResponseMessages.LabelPageNotFound);
  }
  sendResponse(res, { status: HttpStatusCode.OK, data: response, message: ResponseMessages.UpdateLabelPageSuccess });
});

// DELETE /label-pages/:id — refused while rails still sit on the page, so a
// delete can never strand rails on a page key nothing resolves.
export const deleteLabelPage = catchAsync(async (req: AuthRequest, res: Response) => {
  const id = parseInt(req.params.id as string, 10);
  if (!Number.isFinite(id)) {
    return sendError(res, HttpStatusCode.BAD_REQUEST, "Invalid label page id");
  }
  const result = await deleteLabelPageService(id);
  if (!result.ok && result.reason === "NOT_FOUND") {
    return sendError(res, HttpStatusCode.NOT_FOUND, ResponseMessages.LabelPageNotFound);
  }
  if (!result.ok) {
    return sendError(
      res,
      HttpStatusCode.CONFLICT,
      `${ResponseMessages.LabelPageHasRails} (${result.railCount})`,
    );
  }
  sendResponse(res, { status: HttpStatusCode.OK, data: { id }, message: ResponseMessages.DeleteLabelPageSuccess });
});

// POST /label-pages/:id/image?variant=hero|mobile|logo — upload (or replace)
// one of the page's images. Expects multipart/form-data with an "image" file
// (singleImageUpload on the route sets req.file). Defaults to the hero crop.
export const uploadLabelPageImage = catchAsync(async (req: AuthRequest, res: Response) => {
  const id = parseInt(req.params.id as string, 10);
  if (!Number.isFinite(id)) {
    return sendError(res, HttpStatusCode.BAD_REQUEST, "Invalid label page id");
  }

  const variantRaw = typeof req.query.variant === "string" ? req.query.variant : "hero";
  if (variantRaw !== "hero" && variantRaw !== "mobile" && variantRaw !== "logo") {
    return sendError(res, HttpStatusCode.BAD_REQUEST, "variant must be 'hero', 'mobile' or 'logo'");
  }
  const variant = variantRaw as LabelPageImageVariant;

  if (!req.file) {
    return sendError(res, HttpStatusCode.BAD_REQUEST, "An image file is required (field name: image)");
  }

  const result = await uploadLabelPageImageService(id, variant, {
    buffer: req.file.buffer,
    mimetype: req.file.mimetype,
  });
  if (!result) {
    return sendError(res, HttpStatusCode.NOT_FOUND, ResponseMessages.LabelPageNotFound);
  }
  sendResponse(res, { status: HttpStatusCode.OK, data: result, message: ResponseMessages.UploadLabelPageImageSuccess });
});
