import {
  findAllQuickAdds,
  findQuickAddById,
  findQuickAddByCodeOrId,
  quickAddCodeExists,
  createQuickAdd,
  updateQuickAddById,
  deleteQuickAddById,
} from "../../persistence-service/quick-add/modules.export";
import { invalidateAllRailsCache } from "../../persistence-service/rail/modules.export";
import { uploadPublicImageToGCS } from "../../helper-service/gcs.helper";
import type {
  QuickAddResponseData,
  CreateQuickAddRequest,
  UpdateQuickAddRequest,
} from "../../dto-service/quick-add/modules.export";

const toQuickAddResponse = (q: {
  id?: number;
  quickAddCode?: string;
  label: string;
  imageLink?: string;
  linkPath?: string;
  linkParams?: Record<string, string> | null;
  isActive?: boolean;
  createdAt?: Date;
}): QuickAddResponseData => ({
  id: Number(q.id),
  quickAddCode: q.quickAddCode || null,
  label: q.label,
  imageLink: q.imageLink || null,
  linkPath: q.linkPath || null,
  linkParams: q.linkParams ?? null,
  isActive: q.isActive ?? true,
  createdAt: q.createdAt!,
});

export const getQuickAddsService = async (
  activeOnly = false,
): Promise<QuickAddResponseData[]> => {
  const quickAdds = await findAllQuickAdds(activeOnly);
  return quickAdds.map(toQuickAddResponse);
};

export const getQuickAddByIdOrCodeService = async (
  idOrCode: string,
): Promise<QuickAddResponseData | null> => {
  const quickAdd = await findQuickAddByCodeOrId(idOrCode);
  if (!quickAdd) return null;
  return toQuickAddResponse(quickAdd);
};

// ─── CMS write-side (create / edit / delete / image upload) ──────────────────

// No shared slug util exists in this repo — the playlist/occasion/rail modules
// each keep their own local copy, so this mirrors that convention.
const slugify = (input: string): string =>
  input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 200);

const randomSuffix = (): string => Math.random().toString(36).slice(2, 8);

const generateUniqueQuickAddCode = async (baseSlug: string): Promise<string> => {
  const root = baseSlug || `quick-add-${randomSuffix()}`;
  let candidate = root;
  for (let attempt = 0; attempt < 10; attempt++) {
    if (!(await quickAddCodeExists(candidate))) {
      return candidate;
    }
    candidate = `${root}-${randomSuffix()}`;
  }
  return `${root}-${randomSuffix()}${randomSuffix()}`;
};

export const createQuickAddService = async (
  input: CreateQuickAddRequest,
): Promise<QuickAddResponseData> => {
  const label = input.label.trim();
  const quickAddCode = await generateUniqueQuickAddCode(slugify(label));

  const created = await createQuickAdd({
    label,
    quickAddCode,
    linkPath: input.linkPath?.trim() || undefined,
    linkParams: input.linkParams ?? null,
    isActive: input.isActive ?? true,
  });

  await invalidateAllRailsCache();
  return toQuickAddResponse(created);
};

export const updateQuickAddService = async (
  id: number,
  patch: UpdateQuickAddRequest,
): Promise<QuickAddResponseData | null> => {
  const existing = await findQuickAddById(id);
  if (!existing) return null;

  const update: Record<string, unknown> = {};
  if (typeof patch.label === "string" && patch.label.trim()) {
    update.label = patch.label.trim();
  }
  // linkPath and linkParams are explicitly clearable — an empty string / null
  // means "this tile no longer navigates anywhere", which the storefront
  // renders as a non-clickable card.
  if (patch.linkPath !== undefined) {
    update.linkPath = patch.linkPath.trim() || null;
  }
  if (patch.linkParams !== undefined) {
    update.linkParams = patch.linkParams ?? null;
  }
  if (typeof patch.isActive === "boolean") {
    update.isActive = patch.isActive;
  }

  const updated = (await updateQuickAddById(id, update)) ?? existing;
  await invalidateAllRailsCache();
  return toQuickAddResponse(updated);
};

export const deleteQuickAddService = async (id: number): Promise<boolean> => {
  const deleted = await deleteQuickAddById(id);
  if (deleted) await invalidateAllRailsCache();
  return deleted;
};

// mime → file extension for the stored object path.
const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

export interface UploadQuickAddImageResult {
  id: number;
  quickAddCode: string | null;
  imageLink: string;
}

// Upload (or replace) a quick add's tile artwork. Stored under the folder the
// existing hardcoded quick-search PNGs already live in
// (cdn/enterprise/web/quick-search/), but keyed by id rather than by display
// name so a label rename doesn't orphan the object.
export const uploadQuickAddImageService = async (
  id: number,
  file: { buffer: Buffer; mimetype: string },
): Promise<UploadQuickAddImageResult | null> => {
  const quickAdd = await findQuickAddById(id);
  if (!quickAdd) return null;

  const ext = EXT_BY_MIME[file.mimetype] || "img";
  const gcsPath = `enterprise/web/quick-search/${quickAdd.id}.${ext}`;

  const publicUrl = await uploadPublicImageToGCS({
    buffer: file.buffer,
    gcsPath,
    contentType: file.mimetype,
  });

  await updateQuickAddById(id, { imageLink: publicUrl });
  await invalidateAllRailsCache();

  return {
    id: Number(quickAdd.id),
    quickAddCode: quickAdd.quickAddCode || null,
    imageLink: publicUrl,
  };
};
