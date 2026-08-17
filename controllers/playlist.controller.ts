import type { Request, Response } from "express";
import {
  getAllPlaylistsService,
  getPlaylistDetailService,
  searchPlaylistsService,
  createPlaylistService,
  updatePlaylistService,
  archivePlaylistService,
  setPlaylistTracksService,
  uploadPlaylistImageService,
} from "../services/business-service/modules.export";
import { catchAsync, sendResponse, sendError } from "../services/helper-service/modules.export";
import { ResponseMessages } from "../services/dto-service/constants/response-messages";
import {
  CreatePlaylistRequest,
  GetAllPlaylistsQuery,
  GetPlaylistDetailQuery,
  HttpStatusCode,
  PlaylistCategory,
  PlaylistStatus,
  PlaylistType,
  SetPlaylistTracksRequest,
  UpdatePlaylistRequest,
} from "../services/dto-service/modules.export";
import type { SessionPayload } from "../middlewares/authenticate";
import { findUserById } from "../services/persistence-service/exports";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const VALID_TYPES = new Set<string>(Object.values(PlaylistType));
const VALID_STATUSES = new Set<string>(Object.values(PlaylistStatus));
const VALID_CATEGORIES = new Set<string>(Object.values(PlaylistCategory));

interface AuthRequest extends Request {
  session?: SessionPayload;
}

export const getAllPlaylists = catchAsync(async (req: Request, res: Response) => {
  const query: GetAllPlaylistsQuery = {
    page: req.query.page as string,
    limit: req.query.limit as string,
    status: req.query.status as string,
  };
  const response = await getAllPlaylistsService(query);
  sendResponse(res, { status: HttpStatusCode.OK, data: response, message: ResponseMessages.GetPlaylistsSuccess });
});

export const getPlaylistDetail = catchAsync(async (req: AuthRequest, res: Response) => {
  const userId = req.session?.userId;
  const user = userId ? await findUserById(userId) : null;
  const brandId = user?.brandId;
  const query: GetPlaylistDetailQuery = {
    playlistCode: req.params.playlistCode as string,
  };
  const response = await getPlaylistDetailService(query, brandId, userId);
  if (!response) {
    return sendError(res, HttpStatusCode.NOT_FOUND, ResponseMessages.PlaylistNotFound);
  }
  sendResponse(res, { status: HttpStatusCode.OK, data: response, message: ResponseMessages.GetPlaylistDetailSuccess });
});

export const searchPlaylists = catchAsync(async (req: Request, res: Response) => {
  const name = req.query.name as string;
  if (!name || name.trim().length < 1) {
    return sendError(res, HttpStatusCode.BAD_REQUEST, "Search query 'name' is required");
  }
  const response = await searchPlaylistsService({
    name,
    limit: req.query.limit as string,
  });
  sendResponse(res, { status: HttpStatusCode.OK, data: { playlists: response }, message: "Playlists search successful" });
});

// ─── CMS write-side (admin/music gated in the route) ─────────────────────────

const validateCreateBody = (body: unknown): CreatePlaylistRequest | string => {
  if (!body || typeof body !== "object") return "Request body is required";
  const b = body as Record<string, unknown>;
  if (typeof b.name !== "string" || !b.name.trim()) return "name is required";
  if (b.description !== undefined && b.description !== null && typeof b.description !== "string") {
    return "description must be a string";
  }
  if (b.type !== undefined && (typeof b.type !== "string" || !VALID_TYPES.has(b.type))) {
    return `type must be one of ${Array.from(VALID_TYPES).join(", ")}`;
  }
  if (b.category !== undefined && (typeof b.category !== "string" || !VALID_CATEGORIES.has(b.category))) {
    return `category must be one of ${Array.from(VALID_CATEGORIES).join(", ")}`;
  }
  if (b.status !== undefined && (typeof b.status !== "string" || !VALID_STATUSES.has(b.status))) {
    return `status must be one of ${Array.from(VALID_STATUSES).join(", ")}`;
  }
  return b as unknown as CreatePlaylistRequest;
};

// POST /playlists — create a playlist (playlistCode + name_slug generated server-side)
export const createPlaylist = catchAsync(async (req: AuthRequest, res: Response) => {
  const parsed = validateCreateBody(req.body);
  if (typeof parsed === "string") {
    return sendError(res, HttpStatusCode.BAD_REQUEST, parsed);
  }

  const createdBy = req.session?.userId ?? null;
  const response = await createPlaylistService(parsed, createdBy);
  sendResponse(res, { status: HttpStatusCode.CREATED, data: response, message: ResponseMessages.CreatePlaylistSuccess });
});

const validateUpdateBody = (body: unknown): UpdatePlaylistRequest | string => {
  if (!body || typeof body !== "object") return "Request body is required";
  const b = body as Record<string, unknown>;
  if (b.name !== undefined && (typeof b.name !== "string" || !b.name.trim())) {
    return "name must be a non-empty string";
  }
  if (b.description !== undefined && b.description !== null && typeof b.description !== "string") {
    return "description must be a string";
  }
  if (b.type !== undefined && (typeof b.type !== "string" || !VALID_TYPES.has(b.type))) {
    return `type must be one of ${Array.from(VALID_TYPES).join(", ")}`;
  }
  // null / "" is the explicit "clear the assortment" signal.
  if (
    b.category !== undefined &&
    b.category !== null &&
    b.category !== "" &&
    (typeof b.category !== "string" || !VALID_CATEGORIES.has(b.category))
  ) {
    return `category must be one of ${Array.from(VALID_CATEGORIES).join(", ")}, or null to clear`;
  }
  if (b.status !== undefined && (typeof b.status !== "string" || !VALID_STATUSES.has(b.status))) {
    return `status must be one of ${Array.from(VALID_STATUSES).join(", ")}`;
  }
  return b as unknown as UpdatePlaylistRequest;
};

// PUT /playlists/:id — update playlist metadata
export const updatePlaylist = catchAsync(async (req: AuthRequest, res: Response) => {
  const id = req.params.id as string;
  if (!UUID_REGEX.test(id)) {
    return sendError(res, HttpStatusCode.BAD_REQUEST, "Invalid playlist id");
  }
  const parsed = validateUpdateBody(req.body);
  if (typeof parsed === "string") {
    return sendError(res, HttpStatusCode.BAD_REQUEST, parsed);
  }

  const response = await updatePlaylistService(id, parsed);
  if (!response) {
    return sendError(res, HttpStatusCode.NOT_FOUND, ResponseMessages.PlaylistNotFound);
  }
  sendResponse(res, { status: HttpStatusCode.OK, data: response, message: ResponseMessages.UpdatePlaylistSuccess });
});

// PUT /playlists/:id/tracks — replace the full ordered track list
export const setPlaylistTracks = catchAsync(async (req: AuthRequest, res: Response) => {
  const id = req.params.id as string;
  if (!UUID_REGEX.test(id)) {
    return sendError(res, HttpStatusCode.BAD_REQUEST, "Invalid playlist id");
  }
  const body = req.body as Partial<SetPlaylistTracksRequest>;
  if (!Array.isArray(body?.trackCodes) || !body.trackCodes.every((c) => typeof c === "string")) {
    return sendError(res, HttpStatusCode.BAD_REQUEST, "trackCodes must be an array of strings");
  }

  const result = await setPlaylistTracksService(id, body.trackCodes);
  if (!result) {
    return sendError(res, HttpStatusCode.NOT_FOUND, ResponseMessages.PlaylistNotFound);
  }
  sendResponse(res, {
    status: HttpStatusCode.OK,
    data: result.detail,
    message: result.unknownTrackCodes.length > 0
      ? `Tracks updated. Skipped unknown/inactive codes: ${result.unknownTrackCodes.join(", ")}`
      : ResponseMessages.SetPlaylistTracksSuccess,
  });
});

// DELETE /playlists/:id — soft delete (archive)
export const archivePlaylist = catchAsync(async (req: AuthRequest, res: Response) => {
  const id = req.params.id as string;
  if (!UUID_REGEX.test(id)) {
    return sendError(res, HttpStatusCode.BAD_REQUEST, "Invalid playlist id");
  }
  const archived = await archivePlaylistService(id);
  if (!archived) {
    return sendError(res, HttpStatusCode.NOT_FOUND, ResponseMessages.PlaylistNotFound);
  }
  sendResponse(res, { status: HttpStatusCode.OK, data: { id }, message: ResponseMessages.DeletePlaylistSuccess });
});

// POST /playlists/:id/image — upload (or replace) the playlist cover.
// Expects multipart/form-data with an "image" file (handled by the
// singleImageUpload middleware on the route, which sets req.file).
export const uploadPlaylistImage = catchAsync(async (req: AuthRequest, res: Response) => {
  const id = req.params.id as string;
  if (!UUID_REGEX.test(id)) {
    return sendError(res, HttpStatusCode.BAD_REQUEST, "Invalid playlist id");
  }
  if (!req.file) {
    return sendError(res, HttpStatusCode.BAD_REQUEST, "An image file is required (field name: image)");
  }

  const result = await uploadPlaylistImageService(id, {
    buffer: req.file.buffer,
    mimetype: req.file.mimetype,
  });
  if (!result) {
    return sendError(res, HttpStatusCode.NOT_FOUND, ResponseMessages.PlaylistNotFound);
  }
  sendResponse(res, { status: HttpStatusCode.OK, data: result, message: ResponseMessages.UploadPlaylistImageSuccess });
});
