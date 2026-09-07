import {
  findAllLabelPages,
  findLabelPageById,
  findLabelPageBySlugOrId,
  findLabelPageByOwnerCode,
  labelPageSlugExists,
  labelPageOwnerExists,
  createLabelPage,
  updateLabelPageById,
  deleteLabelPageById,
} from "../../persistence-service/label-page/modules.export";
import {
  countRailsByPageKeys,
  invalidateAllRailsCache,
} from "../../persistence-service/rail/modules.export";
import { findOwnerById } from "../../persistence-service/owner/owner.persistence.service";
import { uploadPublicImageToGCS } from "../../helper-service/gcs.helper";
import {
  labelPageKey,
  MAX_LABEL_PAGE_OWNER_CODE_LENGTH,
} from "../../dto-service/modules.export";
import type {
  LabelPageResponseData,
  CreateLabelPageRequest,
  UpdateLabelPageRequest,
  LabelPageImageVariant,
} from "../../dto-service/label-page/modules.export";

const toLabelPageResponse = (
  p: {
    id?: number;
    ownerId: string;
    ownerCode: string;
    slug: string;
    title: string;
    description?: string | null;
    heroImageLink?: string | null;
    mobileHeroImageLink?: string | null;
    logoImageLink?: string | null;
    seoTitle?: string | null;
    seoDescription?: string | null;
    isActive?: boolean;
    createdAt?: Date;
  },
  railCount?: number,
): LabelPageResponseData => ({
  id: Number(p.id),
  ownerId: p.ownerId,
  ownerCode: p.ownerCode,
  slug: p.slug,
  title: p.title,
  description: p.description ?? null,
  heroImageLink: p.heroImageLink ?? null,
  mobileHeroImageLink: p.mobileHeroImageLink ?? null,
  logoImageLink: p.logoImageLink ?? null,
  seoTitle: p.seoTitle ?? null,
  seoDescription: p.seoDescription ?? null,
  isActive: p.isActive ?? true,
  pageKey: labelPageKey(p.ownerCode),
  ...(railCount !== undefined ? { railCount } : {}),
  createdAt: p.createdAt!,
});

// The list carries a rail count per page so the CMS can show which labels have
// a page that is actually built out and which are empty shells. One grouped
// COUNT for the whole list, not one query per row.
export const getLabelPagesService = async (
  activeOnly = false,
): Promise<LabelPageResponseData[]> => {
  const pages = await findAllLabelPages(activeOnly);
  const counts = await countRailsByPageKeys(
    pages.map((page) => labelPageKey(page.ownerCode)),
  );
  return pages.map((page) =>
    toLabelPageResponse(page, counts[labelPageKey(page.ownerCode)] ?? 0),
  );
};

export const getLabelPageBySlugOrIdService = async (
  idOrSlug: string,
): Promise<LabelPageResponseData | null> => {
  const page = await findLabelPageBySlugOrId(idOrSlug);
  if (!page) return null;
  return toLabelPageResponse(page);
};

// ─── CMS write-side (create / edit / delete / image upload) ──────────────────

const slugify = (input: string): string =>
  input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 200);

const randomSuffix = (): string => Math.random().toString(36).slice(2, 8);

const generateUniqueSlug = async (
  baseSlug: string,
  currentSlug?: string,
): Promise<string> => {
  const root = baseSlug || `label-${randomSuffix()}`;
  let candidate = root;
  for (let attempt = 0; attempt < 10; attempt++) {
    if (candidate === currentSlug || !(await labelPageSlugExists(candidate))) {
      return candidate;
    }
    candidate = `${root}-${randomSuffix()}`;
  }
  return `${root}-${randomSuffix()}${randomSuffix()}`;
};

/**
 * Reasons a page can't be created, as a message the CMS shows verbatim. The
 * owner has to exist and be page-able; a second page for the same label would
 * fight the first one for the same rail page key.
 */
export type CreateLabelPageFailure =
  | "OWNER_NOT_FOUND"
  | "OWNER_CODE_TOO_LONG"
  | "PAGE_ALREADY_EXISTS";

export const createLabelPageService = async (
  input: CreateLabelPageRequest,
): Promise<LabelPageResponseData | CreateLabelPageFailure> => {
  const owner = await findOwnerById(input.ownerId);
  if (!owner) return "OWNER_NOT_FOUND";

  // The page key is built from the ownerCode and has to fit rails.pageName.
  if (owner.ownerCode.length > MAX_LABEL_PAGE_OWNER_CODE_LENGTH) {
    return "OWNER_CODE_TOO_LONG";
  }
  if (await labelPageOwnerExists(owner.id)) return "PAGE_ALREADY_EXISTS";

  // Both default to the label's catalogue name — the common case is that the
  // storefront name and the catalogue name agree.
  const title = input.title?.trim() || owner.username || owner.ownerCode;
  const slug = await generateUniqueSlug(slugify(input.slug?.trim() || title));

  const created = await createLabelPage({
    ownerId: owner.id,
    ownerCode: owner.ownerCode,
    slug,
    title,
    description: input.description?.trim() || null,
    seoTitle: input.seoTitle?.trim() || null,
    seoDescription: input.seoDescription?.trim() || null,
    isActive: input.isActive ?? true,
  });

  await invalidateAllRailsCache();
  return toLabelPageResponse(created, 0);
};

export const updateLabelPageService = async (
  id: number,
  patch: UpdateLabelPageRequest,
): Promise<LabelPageResponseData | null> => {
  const existing = await findLabelPageById(id);
  if (!existing) return null;

  const update: Record<string, unknown> = {};
  if (typeof patch.title === "string" && patch.title.trim()) {
    update.title = patch.title.trim();
  }
  if (typeof patch.slug === "string" && patch.slug.trim()) {
    // Re-slugified and re-uniqued: the storefront resolves pages by this, so a
    // hand-typed value with spaces or a collision would 404 the page.
    update.slug = await generateUniqueSlug(
      slugify(patch.slug),
      existing.slug,
    );
  }
  // Copy fields are explicitly clearable — an empty string blanks them rather
  // than leaving the previous text on the page.
  if (patch.description !== undefined) {
    update.description = patch.description?.trim() || null;
  }
  if (patch.seoTitle !== undefined) {
    update.seoTitle = patch.seoTitle?.trim() || null;
  }
  if (patch.seoDescription !== undefined) {
    update.seoDescription = patch.seoDescription?.trim() || null;
  }
  if (typeof patch.isActive === "boolean") {
    update.isActive = patch.isActive;
  }

  const updated = (await updateLabelPageById(id, update)) ?? existing;
  await invalidateAllRailsCache();
  return toLabelPageResponse(updated);
};

/**
 * Delete refuses while rails still point at the page: the rails would survive
 * as rows addressing a page key that no longer resolves, invisible in every
 * CMS tab. Returns the orphan count so the caller can say so.
 */
export type DeleteLabelPageResult =
  | { ok: true }
  | { ok: false; reason: "NOT_FOUND" }
  | { ok: false; reason: "HAS_RAILS"; railCount: number };

export const deleteLabelPageService = async (
  id: number,
): Promise<DeleteLabelPageResult> => {
  const existing = await findLabelPageById(id);
  if (!existing) return { ok: false, reason: "NOT_FOUND" };

  const pageKey = labelPageKey(existing.ownerCode);
  const counts = await countRailsByPageKeys([pageKey]);
  const railCount = counts[pageKey] ?? 0;
  if (railCount > 0) return { ok: false, reason: "HAS_RAILS", railCount };

  const deleted = await deleteLabelPageById(id);
  if (!deleted) return { ok: false, reason: "NOT_FOUND" };
  await invalidateAllRailsCache();
  return { ok: true };
};

const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

const IMAGE_COLUMN: Record<LabelPageImageVariant, string> = {
  hero: "heroImageLink",
  mobile: "mobileHeroImageLink",
  logo: "logoImageLink",
};

export interface UploadLabelPageImageResult {
  id: number;
  slug: string;
  heroImageLink: string | null;
  mobileHeroImageLink: string | null;
  logoImageLink: string | null;
}

// Upload (or replace) one of a page's three images. All live under
// enterprise/web/label-pages/ keyed by id (not by slug, so a rename can't
// orphan the object) — the same convention the web-banner uploads use.
export const uploadLabelPageImageService = async (
  id: number,
  variant: LabelPageImageVariant,
  file: { buffer: Buffer; mimetype: string },
): Promise<UploadLabelPageImageResult | null> => {
  const page = await findLabelPageById(id);
  if (!page) return null;

  const ext = EXT_BY_MIME[file.mimetype] || "img";
  const gcsPath = `enterprise/web/label-pages/${page.id}-${variant}.${ext}`;

  const publicUrl = await uploadPublicImageToGCS({
    buffer: file.buffer,
    gcsPath,
    contentType: file.mimetype,
  });

  const updated = await updateLabelPageById(id, {
    [IMAGE_COLUMN[variant]]: publicUrl,
  });
  await invalidateAllRailsCache();

  return {
    id: Number(page.id),
    slug: page.slug,
    heroImageLink: updated?.heroImageLink ?? null,
    mobileHeroImageLink: updated?.mobileHeroImageLink ?? null,
    logoImageLink: updated?.logoImageLink ?? null,
  };
};

/**
 * The set of label page keys the rails write-path will accept. Only ACTIVE
 * pages qualify: an unpublished page shouldn't be gaining new rails, and the
 * check is what stops a typo'd `LABEL_xyz` from inventing a page nothing can
 * ever reach.
 */
export const isKnownLabelPageOwnerCode = async (
  ownerCode: string,
): Promise<boolean> => {
  const page = await findLabelPageByOwnerCode(ownerCode);
  return page != null && page.isActive;
};
