import {
  findAllPlaylists,
  findPlaylistByCode,
  findPlaylistById,
  findTracksByPlaylistId,
  getRestrictedOwnersByBrandId,
  searchPlaylistsByName,
  createPlaylist,
  updatePlaylistById,
  playlistCodeExists,
  findTrackIdsByTrackCodes,
  setPlaylistTracks,
} from "../../persistence-service/exports";
import { TrackModel } from "../../persistence-service/track/schemas/track.schema";
import { OwnerModel } from "../../persistence-service/owner/modules.export";
import { uploadPublicImageToGCS } from "../../helper-service/gcs.helper";
import { Op } from "sequelize";
import {
  ArtistInfoTrack,
  ArtistType,
  CreatePlaylistRequest,
  GetAllPlaylistsQuery,
  GetPlaylistDetailQuery,
  PaginatedPlaylists,
  PlaylistDetail,
  PlaylistInfo,
  PlaylistStatus,
  PlaylistTrackInfo,
  PlaylistType,
  UpdatePlaylistRequest,
} from "../../dto-service/modules.export";

const buildPaginationResponse = (
  page: number,
  limit: number,
  totalItems: number,
) => {
  const totalPages = Math.ceil(totalItems / limit);
  return {
    page,
    limit,
    totalItems,
    totalPages,
    hasNextPage: page < totalPages,
    hasPrevPage: page > 1,
  };
};

export const getAllPlaylistsService = async (
  query: GetAllPlaylistsQuery,
): Promise<PaginatedPlaylists> => {
  const page = parseInt(query.page || "1", 10);
  const limit = parseInt(query.limit || "10", 10);

  const status = Object.values(PlaylistStatus).includes(query.status as PlaylistStatus)
    ? (query.status as PlaylistStatus)
    : undefined;

  const validPage = page > 0 ? page : 1;
  const validLimit = limit > 0 && limit <= 100 ? limit : 10;
  const offset = (validPage - 1) * validLimit;

  const { count, rows } = await findAllPlaylists({
    limit: validLimit,
    offset,
    status,
  });

  const playlists: PlaylistInfo[] = rows.map((playlist) => ({
    id: playlist.id,
    playlistCode: playlist.playlistCode || null,
    name: playlist.name || "",
    name_slug: playlist.name_slug || null,
    imageLink: playlist.imageLink || null,
  }));

  return {
    playlists,
    pagination: buildPaginationResponse(validPage, validLimit, count),
  };
};

export const getPlaylistDetailService = async (
  query: GetPlaylistDetailQuery,
  brandId?: number,
): Promise<PlaylistDetail | null> => {
  const playlist = await findPlaylistByCode(query.playlistCode);

  if (!playlist) {
    return null;
  }

  // Get restricted owners for the brand
  const excludeOwnerIds = brandId
    ? await getRestrictedOwnersByBrandId(brandId)
    : [];
  const excludeOwnerSet = new Set(excludeOwnerIds);

  const mappings = await findTracksByPlaylistId(playlist.id);

  const validMappings = mappings.filter((mapping) => {
    if (!mapping.track) {
      console.warn(
        `Skipped track with ID: ${mapping.trackId} - not found in tracks table`,
      );
      return false;
    }
    // Filter out tracks from restricted owners
    if (excludeOwnerSet.size > 0) {
      const trackData = mapping.track.toJSON() as any;
      if (trackData.ownerId && Array.isArray(trackData.ownerId)) {
        const hasRestrictedOwner = trackData.ownerId.some((oid: string) =>
          excludeOwnerSet.has(oid)
        );
        if (hasRestrictedOwner) {
          return false;
        }
      }
    }
    return true;
  });

  // Collect all ownerIds from tracks and fetch owner type/subType
  const allOwnerIds: string[] = [];
  validMappings.forEach((mapping) => {
    const trackData = mapping.track!.toJSON() as any;
    if (trackData.ownerId && Array.isArray(trackData.ownerId)) {
      allOwnerIds.push(...trackData.ownerId);
    }
  });

  const ownerTypeMap = new Map<string, string>();
  const ownerSubTypeMap = new Map<string, string>();
  const uniqueOwnerIds = [...new Set(allOwnerIds)];
  if (uniqueOwnerIds.length > 0) {
    const owners = await OwnerModel.findAll({
      where: { id: { [Op.in]: uniqueOwnerIds } },
      attributes: ["id", "type", "subType"],
    });
    owners.forEach((owner) => {
      if (owner.type) ownerTypeMap.set(owner.id, owner.type);
      if (owner.subType) ownerSubTypeMap.set(owner.id, owner.subType);
    });
  }

  const tracks: PlaylistTrackInfo[] = validMappings.map((mapping) => {
    const trackData = mapping.track!.toJSON() as TrackModel & {
      ownerId?: string[];
      trackArtistMappings?: Array<{
        isPrimary?: boolean;
        artist?: { id: string; name: string; type: ArtistType[] };
      }>;
    };

    const primaryArtists: ArtistInfoTrack[] = [];

    if (trackData.trackArtistMappings) {
      for (const artistMapping of trackData.trackArtistMappings) {
        if (artistMapping.artist && artistMapping.isPrimary) {
          primaryArtists.push({
            id: artistMapping.artist.id,
            name: artistMapping.artist.name,
            type: artistMapping.artist.type || [],
          });
        }
      }
    }

    let ownerType: string | undefined;
    let ownerSubType: string | undefined;
    if (trackData.ownerId && Array.isArray(trackData.ownerId)) {
      for (const oid of trackData.ownerId) {
        if (!ownerType && ownerTypeMap.get(oid)) ownerType = ownerTypeMap.get(oid);
        if (!ownerSubType && ownerSubTypeMap.get(oid)) ownerSubType = ownerSubTypeMap.get(oid);
        if (ownerType && ownerSubType) break;
      }
    }

    return {
      id: trackData.id,
      trackCode: trackData.trackCode,
      name: trackData.name || "",
      name_slug: trackData.name_slug || null,
      sourceLink: trackData.sourceLink || null,
      waveformLink: trackData.waveformLink || null,
      mp3Link: trackData.mp3Link || null,
      hasVocals: trackData.hasVocals || null,
      trending: trackData.trending || null,
      primaryArtists,
      ...(ownerType && { ownerType }),
      ...(ownerSubType && { ownerSubType }),
    };
  });

  return {
    id: playlist.id,
    playlistCode: playlist.playlistCode || null,
    name: playlist.name || "",
    name_slug: playlist.name_slug || null,
    description: playlist.description || null,
    imageLink: playlist.imageLink || null,
    tracks,
  };

};

export interface SearchPlaylistsQuery {
  name: string;
  limit?: string;
}

export interface SearchPlaylistItem {
  id: string;
  playlistCode: string | null;
  name: string;
  name_slug: string | null;
  description: string | null;
}

export const searchPlaylistsService = async (
  query: SearchPlaylistsQuery,
): Promise<SearchPlaylistItem[]> => {
  const name = query.name?.trim();
  if (!name || name.length < 1) {
    return [];
  }

  const limit = query.limit ? parseInt(query.limit, 10) : 20;
  const validLimit = limit > 0 && limit <= 50 ? limit : 20;

  const results = await searchPlaylistsByName({
    name,
    limit: validLimit,
  });

  return results;
};

// ─── CMS write-side (create / edit / archive / manage tracks) ────────────────

// Lowercase, strip accents-free non-alphanumerics to dashes, collapse repeats,
// trim leading/trailing dashes. No shared slug util exists in this repo, so we
// keep a local one (the rail module does the same).
const slugify = (input: string): string =>
  input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 200);

// Short random suffix for disambiguating playlistCode collisions.
const randomSuffix = (): string =>
  Math.random().toString(36).slice(2, 8);

// Generate a unique playlistCode derived from the name. Tries the bare slug
// first, then appends a short random suffix, retrying until the code is free
// (capped so a pathological run can't loop forever).
const generateUniquePlaylistCode = async (
  baseSlug: string,
): Promise<string> => {
  const root = baseSlug || `playlist-${randomSuffix()}`;
  let candidate = root;
  for (let attempt = 0; attempt < 10; attempt++) {
    if (!(await playlistCodeExists(candidate))) {
      return candidate;
    }
    candidate = `${root}-${randomSuffix()}`;
  }
  // Extremely unlikely fallback: timestamp-free, fully random tail.
  return `${root}-${randomSuffix()}${randomSuffix()}`;
};

const VALID_PLAYLIST_TYPES = new Set<string>(Object.values(PlaylistType));
const VALID_PLAYLIST_STATUSES = new Set<string>(Object.values(PlaylistStatus));

export const createPlaylistService = async (
  input: CreatePlaylistRequest,
  createdBy?: number | null,
): Promise<PlaylistDetail> => {
  const name = input.name.trim();
  const nameSlug = slugify(name);
  const playlistCode = await generateUniquePlaylistCode(nameSlug);

  const type = VALID_PLAYLIST_TYPES.has(input.type as string)
    ? (input.type as PlaylistType)
    : PlaylistType.CURATED;
  const status = VALID_PLAYLIST_STATUSES.has(input.status as string)
    ? (input.status as PlaylistStatus)
    : PlaylistStatus.ACTIVE;

  const created = await createPlaylist({
    name,
    description: input.description?.trim() || undefined,
    type,
    status,
    name_slug: nameSlug || undefined,
    playlistCode,
    created_by: createdBy != null ? String(createdBy) : undefined,
  });

  return {
    id: created.id,
    playlistCode: created.playlistCode || null,
    name: created.name || "",
    name_slug: created.name_slug || null,
    description: created.description || null,
    imageLink: created.imageLink || null,
    tracks: [],
  };
};

export const updatePlaylistService = async (
  id: string,
  patch: UpdatePlaylistRequest,
): Promise<PlaylistDetail | null> => {
  const existing = await findPlaylistById(id);
  if (!existing) return null;

  const update: Record<string, unknown> = {};

  if (typeof patch.name === "string" && patch.name.trim()) {
    const name = patch.name.trim();
    update.name = name;
    // Refresh the slug to track the name, but leave playlistCode (the public
    // identifier) stable so existing links keep resolving.
    update.name_slug = slugify(name) || undefined;
  }
  if (patch.description !== undefined) {
    update.description = patch.description?.trim() || null;
  }
  if (patch.type !== undefined && VALID_PLAYLIST_TYPES.has(patch.type)) {
    update.type = patch.type;
  }
  if (patch.status !== undefined && VALID_PLAYLIST_STATUSES.has(patch.status)) {
    update.status = patch.status;
  }

  const updated = (await updatePlaylistById(id, update)) ?? existing;

  return {
    id: updated.id,
    playlistCode: updated.playlistCode || null,
    name: updated.name || "",
    name_slug: updated.name_slug || null,
    description: updated.description || null,
    imageLink: updated.imageLink || null,
    tracks: [],
  };
};

// Soft delete — flip status to DELETED. findAllPlaylists / findPlaylistByCode
// already exclude this status, so the playlist disappears from every public
// surface without losing data.
export const archivePlaylistService = async (
  id: string,
): Promise<boolean> => {
  const updated = await updatePlaylistById(id, {
    status: PlaylistStatus.DELETED,
  });
  return updated != null;
};

export interface SetPlaylistTracksResult {
  detail: PlaylistDetail;
  unknownTrackCodes: string[];
}

// Replace a playlist's full ordered track list. Unknown/inactive codes are
// reported back (not silently dropped) so the CMS can surface them. rank is the
// 0-based position in the supplied order.
export const setPlaylistTracksService = async (
  id: string,
  trackCodes: string[],
): Promise<SetPlaylistTracksResult | null> => {
  const playlist = await findPlaylistById(id);
  if (!playlist) return null;

  // De-dupe while preserving order (the mapping table is unique on
  // playlistId+trackId, so duplicates would violate the constraint anyway).
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

  await setPlaylistTracks(id, tracksToSet);

  const detail = await getPlaylistDetailService({
    playlistCode: playlist.playlistCode as string,
  });

  return {
    detail: detail ?? {
      id: playlist.id,
      playlistCode: playlist.playlistCode || null,
      name: playlist.name || "",
      name_slug: playlist.name_slug || null,
      description: playlist.description || null,
      imageLink: playlist.imageLink || null,
      tracks: [],
    },
    unknownTrackCodes,
  };
};

// mime → file extension for the stored object path. Covers the set the upload
// middleware allows; defaults to a generic .img if somehow unknown.
const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

export interface UploadPlaylistImageResult {
  id: string;
  playlistCode: string | null;
  imageLink: string;
}

// Upload (or replace) a playlist's cover. Stores the object at the
// code-keyed CDN path web/playlists/<code>.<ext> so the public site can also
// resolve it by convention; persists the full public URL (with a ?v= cache-bust
// so replaced covers refresh immediately) to playlists.imageLink. Returns null
// if the playlist doesn't exist.
export const uploadPlaylistImageService = async (
  id: string,
  file: { buffer: Buffer; mimetype: string },
): Promise<UploadPlaylistImageResult | null> => {
  const playlist = await findPlaylistById(id);
  if (!playlist) return null;

  // Prefer the playlistCode for the path (matches the CDN convention); fall
  // back to the UUID id for the rare legacy playlist with no code.
  const key = playlist.playlistCode || playlist.id;
  const ext = EXT_BY_MIME[file.mimetype] || "img";
  const gcsPath = `web/playlists/${key}.${ext}`;

  const publicUrl = await uploadPublicImageToGCS({
    buffer: file.buffer,
    gcsPath,
    contentType: file.mimetype,
  });

  // Cache-bust: same object path is overwritten on replace, so append a
  // version query the CDN/browser treats as a new resource.
  const versionedUrl = `${publicUrl}?v=${Date.now()}`;

  await updatePlaylistById(id, { imageLink: versionedUrl });

  return {
    id: playlist.id,
    playlistCode: playlist.playlistCode || null,
    imageLink: versionedUrl,
  };
};
