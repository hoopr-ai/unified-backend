import type { Request, Response } from "express";
import { catchAsync, sendResponse, sendError } from "../services/helper-service/modules.export";
import { ResponseMessages, HttpStatusCode } from "../services/dto-service/modules.export";
import {
  getOccasionsService,
  getTracksByOccasionService,
  createOccasionService,
  updateOccasionService,
  deleteOccasionService,
  uploadOccasionImageService,
} from "../services/business-service/occasion/modules.export";
import { findUserById } from "../services/persistence-service/exports";
import type { SessionPayload } from "../middlewares/authenticate";
import type {
  CreateOccasionRequest,
  UpdateOccasionRequest,
} from "../services/dto-service/occasion/modules.export";

interface AuthRequest extends Request {
  session?: SessionPayload;
}

export const getOccasions = catchAsync(async (_req: Request, res: Response) => {
  const occasions = await getOccasionsService();
  sendResponse(res, {
    status: HttpStatusCode.OK,
    data: occasions,
    message: ResponseMessages.GetOccasionsSuccess,
  });
});

// ─── CMS write-side (admin/music gated in the route) ─────────────────────────

const validateCreateBody = (body: unknown): CreateOccasionRequest | string => {
  if (!body || typeof body !== "object") return "Request body is required";
  const b = body as Record<string, unknown>;
  if (typeof b.title !== "string" || !b.title.trim()) return "title is required";
  if (typeof b.month !== "string" || !b.month.trim()) return "month is required";
  if (typeof b.date !== "string" || !b.date.trim()) return "date is required";
  if (typeof b.className !== "string" || !b.className.trim()) return "className is required";
  if (typeof b.end !== "string" || !b.end.trim()) return "end is required";
  return b as unknown as CreateOccasionRequest;
};

// POST /occasions — create an occasion (occasionCode generated server-side)
export const createOccasion = catchAsync(async (req: AuthRequest, res: Response) => {
  const parsed = validateCreateBody(req.body);
  if (typeof parsed === "string") {
    return sendError(res, HttpStatusCode.BAD_REQUEST, parsed);
  }

  const response = await createOccasionService(parsed);
  sendResponse(res, { status: HttpStatusCode.CREATED, data: response, message: ResponseMessages.CreateOccasionSuccess });
});

const validateUpdateBody = (body: unknown): UpdateOccasionRequest | string => {
  if (!body || typeof body !== "object") return "Request body is required";
  const b = body as Record<string, unknown>;
  if (b.title !== undefined && (typeof b.title !== "string" || !b.title.trim())) {
    return "title must be a non-empty string";
  }
  if (b.month !== undefined && (typeof b.month !== "string" || !b.month.trim())) {
    return "month must be a non-empty string";
  }
  if (b.date !== undefined && (typeof b.date !== "string" || !b.date.trim())) {
    return "date must be a non-empty string";
  }
  if (b.className !== undefined && (typeof b.className !== "string" || !b.className.trim())) {
    return "className must be a non-empty string";
  }
  if (b.end !== undefined && (typeof b.end !== "string" || !b.end.trim())) {
    return "end must be a non-empty string";
  }
  return b as unknown as UpdateOccasionRequest;
};

// PUT /occasions/:id — update occasion metadata
export const updateOccasion = catchAsync(async (req: AuthRequest, res: Response) => {
  const id = parseInt(req.params.id as string, 10);
  if (!Number.isFinite(id)) {
    return sendError(res, HttpStatusCode.BAD_REQUEST, "Invalid occasion id");
  }
  const parsed = validateUpdateBody(req.body);
  if (typeof parsed === "string") {
    return sendError(res, HttpStatusCode.BAD_REQUEST, parsed);
  }

  const response = await updateOccasionService(id, parsed);
  if (!response) {
    return sendError(res, HttpStatusCode.NOT_FOUND, ResponseMessages.OccasionNotFound);
  }
  sendResponse(res, { status: HttpStatusCode.OK, data: response, message: ResponseMessages.UpdateOccasionSuccess });
});

// DELETE /occasions/:id
export const deleteOccasion = catchAsync(async (req: AuthRequest, res: Response) => {
  const id = parseInt(req.params.id as string, 10);
  if (!Number.isFinite(id)) {
    return sendError(res, HttpStatusCode.BAD_REQUEST, "Invalid occasion id");
  }
  const deleted = await deleteOccasionService(id);
  if (!deleted) {
    return sendError(res, HttpStatusCode.NOT_FOUND, ResponseMessages.OccasionNotFound);
  }
  sendResponse(res, { status: HttpStatusCode.OK, data: { id }, message: ResponseMessages.DeleteOccasionSuccess });
});

// POST /occasions/:id/image — upload (or replace) the occasion cover.
// Expects multipart/form-data with an "image" file (handled by the
// singleImageUpload middleware on the route, which sets req.file).
export const uploadOccasionImage = catchAsync(async (req: AuthRequest, res: Response) => {
  const id = parseInt(req.params.id as string, 10);
  if (!Number.isFinite(id)) {
    return sendError(res, HttpStatusCode.BAD_REQUEST, "Invalid occasion id");
  }
  if (!req.file) {
    return sendError(res, HttpStatusCode.BAD_REQUEST, "An image file is required (field name: image)");
  }

  const result = await uploadOccasionImageService(id, {
    buffer: req.file.buffer,
    mimetype: req.file.mimetype,
  });
  if (!result) {
    return sendError(res, HttpStatusCode.NOT_FOUND, ResponseMessages.OccasionNotFound);
  }
  sendResponse(res, { status: HttpStatusCode.OK, data: result, message: ResponseMessages.UploadOccasionImageSuccess });
});

export const getTracksByOccasion = catchAsync(async (req: AuthRequest, res: Response) => {
  const userId = req.session?.userId;
  const user = userId ? await findUserById(userId) : null;
  const brandId = user?.brandId;
  const occasionId = parseInt(req.params.occasionId as string, 10);
  const page = parseInt((req.query.page as string) || "1", 10);
  const limit = parseInt((req.query.limit as string) || "10", 10);

  const response = await getTracksByOccasionService(occasionId, page, limit, userId, brandId);
  sendResponse(res, {
    status: HttpStatusCode.OK,
    data: response,
    message: ResponseMessages.GetTracksSuccess,
  });
});
