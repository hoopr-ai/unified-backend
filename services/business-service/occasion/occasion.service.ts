import {
  findAllOccasions,
  findOccasionById,
  occasionCodeExists,
  createOccasion,
  updateOccasionById,
  deleteOccasionById,
} from "../../persistence-service/occasion/modules.export";
import { findKeywordIdsByOccasionId, findTracksByKeywordIds } from "../../persistence-service/keyword/modules.export";
import { getRestrictedOwnersByBrandId } from "../../persistence-service/exports";
import { getUserLikedTrackCodes } from "../../persistence-service/user/liked-track.persistence.service";
import { buildTracksResponseFromRawData } from "../track/track.service";
import { uploadPublicImageToGCS } from "../../helper-service/gcs.helper";
import type {
  OccasionResponseData,
  CreateOccasionRequest,
  UpdateOccasionRequest,
} from "../../dto-service/occasion/modules.export";
import type { PaginatedTracksResponseData } from "../../dto-service/modules.export";

const toOccasionResponse = (o: {
  id?: number;
  title: string;
  month: string;
  date: string;
  className: string;
  end: string;
  occasionCode?: string;
  imageLink?: string;
  createdAt?: Date;
}): OccasionResponseData => ({
  id: o.id!,
  title: o.title,
  month: o.month,
  date: o.date,
  className: o.className,
  end: o.end,
  occasionCode: o.occasionCode || null,
  imageLink: o.imageLink || null,
  createdAt: o.createdAt!,
});

export const getOccasionsService = async (): Promise<OccasionResponseData[]> => {
  const occasions = await findAllOccasions();
  return occasions.map(toOccasionResponse);
};

// ─── CMS write-side (create / edit / delete / image upload) ────────────────

// Lowercase, strip non-alphanumerics to dashes, collapse repeats, trim edges.
// No shared slug util exists in this repo — the playlist/rail modules each
// keep their own local copy, so this mirrors that convention.
const slugify = (input: string): string =>
  input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 200);

const randomSuffix = (): string => Math.random().toString(36).slice(2, 8);

const generateUniqueOccasionCode = async (
  baseSlug: string,
): Promise<string> => {
  const root = baseSlug || `occasion-${randomSuffix()}`;
  let candidate = root;
  for (let attempt = 0; attempt < 10; attempt++) {
    if (!(await occasionCodeExists(candidate))) {
      return candidate;
    }
    candidate = `${root}-${randomSuffix()}`;
  }
  return `${root}-${randomSuffix()}${randomSuffix()}`;
};

export const createOccasionService = async (
  input: CreateOccasionRequest,
): Promise<OccasionResponseData> => {
  const title = input.title.trim();
  const occasionCode = await generateUniqueOccasionCode(slugify(title));

  const created = await createOccasion({
    title,
    month: input.month,
    date: input.date,
    className: input.className,
    end: input.end,
    occasionCode,
  });

  return toOccasionResponse(created);
};

export const updateOccasionService = async (
  id: number,
  patch: UpdateOccasionRequest,
): Promise<OccasionResponseData | null> => {
  const existing = await findOccasionById(id);
  if (!existing) return null;

  const update: Record<string, unknown> = {};
  if (typeof patch.title === "string" && patch.title.trim()) {
    update.title = patch.title.trim();
  }
  if (typeof patch.month === "string" && patch.month.trim()) {
    update.month = patch.month.trim();
  }
  if (typeof patch.date === "string" && patch.date.trim()) {
    update.date = patch.date.trim();
  }
  if (typeof patch.className === "string" && patch.className.trim()) {
    update.className = patch.className.trim();
  }
  if (typeof patch.end === "string" && patch.end.trim()) {
    update.end = patch.end.trim();
  }

  const updated = (await updateOccasionById(id, update)) ?? existing;
  return toOccasionResponse(updated);
};

export const deleteOccasionService = async (id: number): Promise<boolean> => {
  return await deleteOccasionById(id);
};

// mime → file extension for the stored object path.
const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

export interface UploadOccasionImageResult {
  id: number;
  occasionCode: string | null;
  imageLink: string;
}

// Upload (or replace) an occasion's cover image. Mirrors
// uploadPlaylistImageService exactly: stores at a code-keyed, version-suffixed
// GCS path so replacing an image is always a fresh CDN cache miss.
export const uploadOccasionImageService = async (
  id: number,
  file: { buffer: Buffer; mimetype: string },
): Promise<UploadOccasionImageResult | null> => {
  const occasion = await findOccasionById(id);
  if (!occasion) return null;

  const key = occasion.occasionCode || occasion.id;
  const ext = EXT_BY_MIME[file.mimetype] || "img";
  const version = Date.now().toString(36);
  const gcsPath = `web/occasions/${key}-${version}.${ext}`;

  const publicUrl = await uploadPublicImageToGCS({
    buffer: file.buffer,
    gcsPath,
    contentType: file.mimetype,
  });

  await updateOccasionById(id, { imageLink: publicUrl });

  return {
    id: occasion.id,
    occasionCode: occasion.occasionCode || null,
    imageLink: publicUrl,
  };
};

export const getTracksByOccasionService = async (
  occasionId: number,
  page: number,
  limit: number,
  userId?: number,
  brandId?: number,
): Promise<PaginatedTracksResponseData> => {
  const keywordIds = await findKeywordIdsByOccasionId(occasionId);

  if (keywordIds.length === 0) {
    return {
      tracks: [],
      pagination: { page, limit, totalItems: 0, totalPages: 0, hasNextPage: false, hasPrevPage: false },
    };
  }

  const excludeOwnerIds = brandId ? await getRestrictedOwnersByBrandId(brandId) : undefined;

  let likedTrackCodes: Set<string> | undefined;
  if (userId) {
    const likedCodes = await getUserLikedTrackCodes(userId);
    likedTrackCodes = new Set(likedCodes);
  }

  const rawData = await findTracksByKeywordIds(keywordIds, page, limit, undefined, excludeOwnerIds);
  return buildTracksResponseFromRawData(rawData, likedTrackCodes);
};
