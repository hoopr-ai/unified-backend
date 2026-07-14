import {
  findAllWebBanners,
  findWebBannerById,
  findWebBannerByCodeOrId,
  webBannerCodeExists,
  createWebBanner,
  updateWebBannerById,
  deleteWebBannerById,
} from "../../persistence-service/web-banner/modules.export";
import { invalidateAllRailsCache } from "../../persistence-service/rail/modules.export";
import { uploadPublicImageToGCS } from "../../helper-service/gcs.helper";
import type {
  WebBannerResponseData,
  CreateWebBannerRequest,
  UpdateWebBannerRequest,
  WebBannerImageVariant,
} from "../../dto-service/web-banner/modules.export";

const toWebBannerResponse = (b: {
  id?: number;
  bannerCode?: string;
  title: string;
  imageLink?: string;
  mobileImageLink?: string;
  linkPath?: string;
  linkParams?: Record<string, string> | null;
  isActive?: boolean;
  createdAt?: Date;
}): WebBannerResponseData => ({
  id: Number(b.id),
  bannerCode: b.bannerCode || null,
  title: b.title,
  imageLink: b.imageLink || null,
  mobileImageLink: b.mobileImageLink || null,
  linkPath: b.linkPath || null,
  linkParams: b.linkParams ?? null,
  isActive: b.isActive ?? true,
  createdAt: b.createdAt!,
});

export const getWebBannersService = async (
  activeOnly = false,
): Promise<WebBannerResponseData[]> => {
  const banners = await findAllWebBanners(activeOnly);
  return banners.map(toWebBannerResponse);
};

export const getWebBannerByIdOrCodeService = async (
  idOrCode: string,
): Promise<WebBannerResponseData | null> => {
  const banner = await findWebBannerByCodeOrId(idOrCode);
  if (!banner) return null;
  return toWebBannerResponse(banner);
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

const generateUniqueBannerCode = async (baseSlug: string): Promise<string> => {
  const root = baseSlug || `banner-${randomSuffix()}`;
  let candidate = root;
  for (let attempt = 0; attempt < 10; attempt++) {
    if (!(await webBannerCodeExists(candidate))) {
      return candidate;
    }
    candidate = `${root}-${randomSuffix()}`;
  }
  return `${root}-${randomSuffix()}${randomSuffix()}`;
};

export const createWebBannerService = async (
  input: CreateWebBannerRequest,
): Promise<WebBannerResponseData> => {
  const title = input.title.trim();
  const bannerCode = await generateUniqueBannerCode(slugify(title));

  const created = await createWebBanner({
    title,
    bannerCode,
    linkPath: input.linkPath?.trim() || undefined,
    linkParams: input.linkParams ?? null,
    isActive: input.isActive ?? true,
  });

  await invalidateAllRailsCache();
  return toWebBannerResponse(created);
};

export const updateWebBannerService = async (
  id: number,
  patch: UpdateWebBannerRequest,
): Promise<WebBannerResponseData | null> => {
  const existing = await findWebBannerById(id);
  if (!existing) return null;

  const update: Record<string, unknown> = {};
  if (typeof patch.title === "string" && patch.title.trim()) {
    update.title = patch.title.trim();
  }
  // linkPath/linkParams are explicitly clearable — an empty string / null makes
  // the banner non-clickable rather than leaving the old destination in place.
  if (patch.linkPath !== undefined) {
    update.linkPath = patch.linkPath.trim() || null;
  }
  if (patch.linkParams !== undefined) {
    update.linkParams = patch.linkParams ?? null;
  }
  if (typeof patch.isActive === "boolean") {
    update.isActive = patch.isActive;
  }

  const updated = (await updateWebBannerById(id, update)) ?? existing;
  await invalidateAllRailsCache();
  return toWebBannerResponse(updated);
};

export const deleteWebBannerService = async (id: number): Promise<boolean> => {
  const deleted = await deleteWebBannerById(id);
  if (deleted) await invalidateAllRailsCache();
  return deleted;
};

const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

export interface UploadWebBannerImageResult {
  id: number;
  bannerCode: string | null;
  imageLink: string | null;
  mobileImageLink: string | null;
}

// Upload (or replace) a banner's artwork. `variant` picks which crop is being
// replaced; both live under enterprise/web/banners/ keyed by id (not by title,
// so a rename can't orphan the object).
export const uploadWebBannerImageService = async (
  id: number,
  variant: WebBannerImageVariant,
  file: { buffer: Buffer; mimetype: string },
): Promise<UploadWebBannerImageResult | null> => {
  const banner = await findWebBannerById(id);
  if (!banner) return null;

  const ext = EXT_BY_MIME[file.mimetype] || "img";
  const suffix = variant === "mobile" ? "-mobile" : "";
  const gcsPath = `enterprise/web/banners/${banner.id}${suffix}.${ext}`;

  const publicUrl = await uploadPublicImageToGCS({
    buffer: file.buffer,
    gcsPath,
    contentType: file.mimetype,
  });

  const column = variant === "mobile" ? "mobileImageLink" : "imageLink";
  const updated = await updateWebBannerById(id, { [column]: publicUrl });
  await invalidateAllRailsCache();

  return {
    id: Number(banner.id),
    bannerCode: banner.bannerCode || null,
    imageLink: updated?.imageLink || null,
    mobileImageLink: updated?.mobileImageLink || null,
  };
};
