import {
  findAllOccasions,
  findOccasionById,
  findOccasionByCodeOrId,
  occasionCodeExists,
  createOccasion,
  updateOccasionById,
  deleteOccasionById,
  findOccasionTrackMappings,
  setOccasionTracks,
  deleteOccasionTrackMappings,
} from "../../persistence-service/occasion/modules.export";
import { findKeywordIdsByOccasionId, findTracksByKeywordIds } from "../../persistence-service/keyword/modules.export";
import {
  getRestrictedOwnersByBrandId,
  findTrackIdsByTrackCodes,
  getActiveBrandTokenTypes,
  getOwnerIdsByNames,
} from "../../persistence-service/exports";
import { getUserLikedTrackCodes } from "../../persistence-service/user/liked-track.persistence.service";
import { buildTracksResponseFromRawData, transformRawTracksToDto } from "../track/track.service";
import { uploadPublicImageToGCS } from "../../helper-service/gcs.helper";
import type {
  OccasionResponseData,
  CreateOccasionRequest,
  UpdateOccasionRequest,
} from "../../dto-service/occasion/modules.export";
import { UNAUTHENTICATED_RESTRICTED_OWNER_NAMES } from "../../dto-service/modules.export";
import type {
  PaginatedTracksResponseData,
  RawTrackWithMappings,
  TrackWithArtists,
} from "../../dto-service/modules.export";

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

// Single-occasion detail — resolves by occasionCode OR numeric id.
export const getOccasionByIdOrCodeService = async (
  idOrCode: string,
): Promise<OccasionResponseData | null> => {
  const occasion = await findOccasionByCodeOrId(idOrCode);
  if (!occasion) return null;
  return toOccasionResponse(occasion);
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
  const deleted = await deleteOccasionById(id);
  if (deleted) {
    // Hygiene cleanup — no DB-level cascade (constraints: false on the mapping).
    await deleteOccasionTrackMappings(id);
  }
  return deleted;
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

// Upload (or replace) an occasion's cover image. Stores at the existing
// enterprise convention `enterprise/web/occasion/<id>.<ext>` (id-keyed, no
// version suffix) — matches how occasion covers already live in the CDN
// bucket, e.g. cdn-hooprsmash-com-prod/enterprise/web/occasion/10.webp.
export const uploadOccasionImageService = async (
  id: number,
  file: { buffer: Buffer; mimetype: string },
): Promise<UploadOccasionImageResult | null> => {
  const occasion = await findOccasionById(id);
  if (!occasion) return null;

  const ext = EXT_BY_MIME[file.mimetype] || "img";
  const gcsPath = `enterprise/web/occasion/${occasion.id}.${ext}`;

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

// Occasion-scoped catalogs are bounded (curated by admins / tagged by a
// handful of keywords), unlike the full track catalog — so unlike
// findTracksByKeywordIds' own DB-level pagination, we fetch the full
// keyword-tagged set here and paginate the merged result in memory.
const MAX_KEYWORD_TAGGED_TRACKS = 1000;

const mappingsToRawTracks = (
  mappings: { track?: unknown }[],
): RawTrackWithMappings[] =>
  mappings
    .filter((m): m is { track: NonNullable<typeof m.track> } => m.track != null)
    .map((m) => (m.track as { toJSON: () => unknown }).toJSON() as unknown as RawTrackWithMappings);

// Public/consumer track listing for an occasion — merges the CMS-curated
// tracks (track_occasion_mappings, admin order preserved) with any
// legacy keyword-tagged tracks (occasions -> keywords -> track_keyword_mappings),
// deduped by track id, then paginates the combined set in application code.
export const getTracksByOccasionService = async (
  occasionId: number,
  page: number,
  limit: number,
  userId?: number,
  brandId?: number,
): Promise<PaginatedTracksResponseData> => {
  const [curatedMappings, keywordIds] = await Promise.all([
    findOccasionTrackMappings(occasionId),
    findKeywordIdsByOccasionId(occasionId),
  ]);

  // Same restriction + token logic as the normal tracks API: a brand holding a
  // Chartbusters token sees the default-restricted (enterprise) owners; other
  // brands and unauthenticated users get them excluded. activeTokenTypes then
  // drives the token/price display in transformTrackToDto.
  let excludeOwnerIds: string[] | undefined;
  let activeTokenTypes = new Set<string>();
  if (brandId) {
    const [brandExcludeOwnerIds, tokenTypes, defaultRestrictedIds] = await Promise.all([
      getRestrictedOwnersByBrandId(brandId),
      getActiveBrandTokenTypes(brandId),
      UNAUTHENTICATED_RESTRICTED_OWNER_NAMES.length > 0
        ? getOwnerIdsByNames(UNAUTHENTICATED_RESTRICTED_OWNER_NAMES)
        : Promise.resolve([]),
    ]);
    activeTokenTypes = tokenTypes;
    const defaultRestricted = tokenTypes.has("Chartbusters") ? [] : defaultRestrictedIds;
    const combined = [...(brandExcludeOwnerIds || []), ...defaultRestricted];
    excludeOwnerIds = combined.length > 0 ? combined : undefined;
  } else if (UNAUTHENTICATED_RESTRICTED_OWNER_NAMES.length > 0) {
    const resolvedIds = await getOwnerIdsByNames(UNAUTHENTICATED_RESTRICTED_OWNER_NAMES);
    excludeOwnerIds = resolvedIds.length > 0 ? resolvedIds : undefined;
  }
  const excludeOwnerSet = new Set(excludeOwnerIds ?? []);

  const curatedRaw = mappingsToRawTracks(curatedMappings);

  let keywordRaw: RawTrackWithMappings[] = [];
  if (keywordIds.length > 0) {
    const keywordResult = await findTracksByKeywordIds(
      keywordIds,
      1,
      MAX_KEYWORD_TAGGED_TRACKS,
      undefined,
      excludeOwnerIds,
    );
    keywordRaw = keywordResult.rows;
  }

  const seenIds = new Set(curatedRaw.map((t) => t.id));
  const merged = [
    ...curatedRaw,
    ...keywordRaw.filter((t) => {
      if (seenIds.has(t.id)) return false;
      seenIds.add(t.id);
      return true;
    }),
  ];

  // Curated tracks aren't pre-filtered by brand restrictions (unlike the
  // keyword path, which already applied excludeOwnerIds) — apply it here too.
  const filtered =
    excludeOwnerSet.size > 0
      ? merged.filter((t) => {
          const ownerIds = (t as unknown as { ownerId?: string[] }).ownerId;
          return !(Array.isArray(ownerIds) && ownerIds.some((oid) => excludeOwnerSet.has(oid)));
        })
      : merged;

  const totalItems = filtered.length;
  const totalPages = totalItems === 0 ? 0 : Math.ceil(totalItems / limit);
  const offset = (page - 1) * limit;
  const pageRows = filtered.slice(offset, offset + limit);

  let likedTrackCodes: Set<string> | undefined;
  if (userId) {
    likedTrackCodes = new Set(await getUserLikedTrackCodes(userId));
  }

  const tracks = await transformRawTracksToDto(pageRows, likedTrackCodes, activeTokenTypes);

  return {
    tracks,
    pagination: {
      page,
      limit,
      totalItems,
      totalPages,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
    },
  };
};

// ─── CMS-managed track attach/detach ────────────────────────────────────────

export interface OccasionCuratedTracks {
  tracks: TrackWithArtists[];
}

// CMS editor's "current tracks" view — only the admin-curated list, not the
// merged public view above (admins can't edit legacy keyword tags from here).
export const getOccasionCuratedTracksService = async (
  occasionId: number,
): Promise<OccasionCuratedTracks | null> => {
  const occasion = await findOccasionById(occasionId);
  if (!occasion) return null;

  const mappings = await findOccasionTrackMappings(occasionId);
  const tracks = await transformRawTracksToDto(mappingsToRawTracks(mappings));
  return { tracks };
};

export interface SetOccasionTracksResult {
  tracks: TrackWithArtists[];
  unknownTrackCodes: string[];
}

// Replace the full ordered curated track list. Unknown/inactive codes are
// reported back (not silently dropped) so the CMS can surface them — mirrors
// setPlaylistTracksService. rank is the 0-based position in the supplied order.
export const setOccasionTracksService = async (
  occasionId: number,
  trackCodes: string[],
): Promise<SetOccasionTracksResult | null> => {
  const occasion = await findOccasionById(occasionId);
  if (!occasion) return null;

  const seen = new Set<string>();
  const orderedCodes = trackCodes.filter((code) => {
    if (seen.has(code)) return false;
    seen.add(code);
    return true;
  });

  const resolved = await findTrackIdsByTrackCodes(orderedCodes);
  const codeToId = new Map(resolved.map((t) => [t.trackCode, t.id]));
  const unknownTrackCodes = orderedCodes.filter((c) => !codeToId.has(c));

  const tracksToSet = orderedCodes
    .filter((c) => codeToId.has(c))
    .map((code, index) => ({ trackId: codeToId.get(code)!, rank: index }));

  await setOccasionTracks(occasionId, tracksToSet);

  const mappings = await findOccasionTrackMappings(occasionId);
  const tracks = await transformRawTracksToDto(mappingsToRawTracks(mappings));

  return { tracks, unknownTrackCodes };
};
