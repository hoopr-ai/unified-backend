import { Op } from "sequelize";
import {
  RailType,
  RailSourceType,
  RailItemType,
  RailResponse,
  RailItemResponse,
  RailSeeMoreDescriptor,
  UNAUTHENTICATED_RESTRICTED_OWNER_NAMES,
} from "../../dto-service/modules.export";
import {
  RailModel,
  RailItemModel,
  RailDetails,
  RailItemDetails,
  findRailsForBrand,
  findRailByKey,
  findRailByKeyAndBrand,
  getMaxRailOrder,
  upsertRailWithItems,
  findTracksByTrackCodes,
  findTracksByFilter,
  findAllTracks,
  findTrackIdsByAlbumType,
  FilterModel,
  PlaylistModel,
  getRestrictedOwnersByBrandId,
  getOwnerIdsByNames,
} from "../../persistence-service/exports";
import { OwnerModel } from "../../persistence-service/owner/modules.export";
import { fn, col, where } from "sequelize";
import { getUserLikedTrackCodes } from "../../persistence-service/user/liked-track.persistence.service";
import { transformRawTracksToDto } from "../track/track.service";

// Keep brand-scoped row when a default with the same key also exists
const resolveBrandOverrides = (rails: RailModel[]): RailModel[] => {
  const byKey = new Map<string, RailModel>();
  for (const rail of rails) {
    const existing = byKey.get(rail.key);
    if (!existing) {
      byKey.set(rail.key, rail);
      continue;
    }
    const existingIsBrand = existing.brandId != null;
    const currentIsBrand = rail.brandId != null;
    if (currentIsBrand && !existingIsBrand) {
      byKey.set(rail.key, rail);
    }
  }
  return Array.from(byKey.values()).sort((a, b) => a.order - b.order);
};

interface HydrationMaps {
  tracks: Map<string, unknown>;
  filters: Map<string, unknown>;
  playlists: Map<string, unknown>;
}

const hydrateTracks = async (
  trackCodes: string[],
  userId?: number,
  brandId?: number,
): Promise<Map<string, unknown>> => {
  const out = new Map<string, unknown>();
  if (trackCodes.length === 0) return out;

  let excludeOwnerIds: string[] | undefined;
  if (brandId) {
    excludeOwnerIds = await getRestrictedOwnersByBrandId(brandId);
  } else if (UNAUTHENTICATED_RESTRICTED_OWNER_NAMES.length > 0) {
    const resolvedIds = await getOwnerIdsByNames(UNAUTHENTICATED_RESTRICTED_OWNER_NAMES);
    excludeOwnerIds = resolvedIds.length > 0 ? resolvedIds : undefined;
  }

  let likedTrackCodes: Set<string> | undefined;
  if (userId) {
    const liked = await getUserLikedTrackCodes(userId);
    likedTrackCodes = new Set(liked);
  }

  const rawData = await findTracksByTrackCodes(
    trackCodes,
    1,
    trackCodes.length,
    undefined,
    excludeOwnerIds,
  );
  const dtos = await transformRawTracksToDto(rawData.rows, likedTrackCodes);
  for (const dto of dtos) {
    out.set(dto.trackCode, dto);
  }
  return out;
};

const hydrateFilters = async (
  itemCodes: string[],
): Promise<Map<string, unknown>> => {
  const out = new Map<string, unknown>();
  if (itemCodes.length === 0) return out;

  const rows = await FilterModel.findAll({
    where: {
      [Op.or]: [
        { id: { [Op.in]: itemCodes } },
        { name_slug: { [Op.in]: itemCodes } },
      ],
    },
    attributes: ["id", "name", "name_slug", "type"],
  });

  for (const row of rows) {
    const json = row.toJSON() as unknown as Record<string, unknown>;
    const id = json.id as string | undefined;
    const slug = json.name_slug as string | undefined | null;
    if (id) out.set(id, json);
    if (slug) out.set(slug, json);
  }
  return out;
};

const hydratePlaylists = async (
  itemCodes: string[],
): Promise<Map<string, unknown>> => {
  const out = new Map<string, unknown>();
  if (itemCodes.length === 0) return out;

  const rows = await PlaylistModel.findAll({
    where: {
      [Op.or]: [
        { playlistCode: { [Op.in]: itemCodes } },
        { id: { [Op.in]: itemCodes } },
      ],
    },
    attributes: ["id", "playlistCode", "name", "name_slug", "description"],
  });

  for (const row of rows) {
    const json = row.toJSON() as unknown as Record<string, unknown>;
    const id = json.id as string | undefined;
    const code = json.playlistCode as string | undefined;
    if (id) out.set(id, json);
    if (code) out.set(code, json);
  }
  return out;
};

const collectItemCodes = (
  rails: RailModel[],
): {
  trackCodes: string[];
  filterCodes: string[];
  playlistCodes: string[];
} => {
  const tracks = new Set<string>();
  const filters = new Set<string>();
  const playlists = new Set<string>();
  for (const rail of rails) {
    const items = rail.items ?? [];
    for (const item of items) {
      if (item.itemType === RailItemType.TRACK) tracks.add(item.itemCode);
      else if (item.itemType === RailItemType.PLAYLIST) playlists.add(item.itemCode);
      else filters.add(item.itemCode);
    }
  }
  return {
    trackCodes: Array.from(tracks),
    filterCodes: Array.from(filters),
    playlistCodes: Array.from(playlists),
  };
};

const buildHydrationMaps = async (
  rails: RailModel[],
  userId?: number,
  brandId?: number,
): Promise<HydrationMaps> => {
  const { trackCodes, filterCodes, playlistCodes } = collectItemCodes(rails);
  const [tracks, filters, playlists] = await Promise.all([
    hydrateTracks(trackCodes, userId, brandId),
    hydrateFilters(filterCodes),
    hydratePlaylists(playlistCodes),
  ]);
  return { tracks, filters, playlists };
};

const resolveItem = (
  item: RailItemModel,
  maps: HydrationMaps,
): unknown => {
  if (item.itemType === RailItemType.TRACK) {
    return maps.tracks.get(item.itemCode) ?? null;
  }
  if (item.itemType === RailItemType.PLAYLIST) {
    return maps.playlists.get(item.itemCode) ?? null;
  }
  return maps.filters.get(item.itemCode) ?? null;
};

const extractSeeMore = (
  rail: RailModel,
): RailSeeMoreDescriptor | null => {
  const cfg = rail.sourceConfig;
  if (!cfg || typeof cfg !== "object") return null;
  const seeMore = (cfg as { seeMore?: RailSeeMoreDescriptor }).seeMore;
  return seeMore ?? null;
};

const buildRailResponse = (
  rail: RailModel,
  maps: HydrationMaps,
): RailResponse => {
  const items = (rail.items ?? [])
    .slice()
    .sort((a, b) => a.order - b.order)
    .map<RailItemResponse>((item) => ({
      itemType: item.itemType,
      itemCode: item.itemCode,
      order: item.order,
      data: resolveItem(item, maps),
    }))
    .filter((entry) => entry.data !== null);

  return {
    id: rail.id,
    key: rail.key,
    title: rail.title,
    subtitle: rail.subtitle ?? null,
    type: rail.type,
    subType: rail.subType ?? null,
    sourceType: rail.sourceType,
    order: rail.order,
    items,
    seeMore: extractSeeMore(rail),
  };
};

export const getRailsService = async (
  brandId?: number,
  userId?: number,
): Promise<RailResponse[]> => {
  const raw = await findRailsForBrand(brandId);
  const resolved = resolveBrandOverrides(raw);
  const maps = await buildHydrationMaps(resolved, userId, brandId);
  return resolved.map((rail) => buildRailResponse(rail, maps));
};

export const getRailByKeyService = async (
  key: string,
  brandId?: number,
  userId?: number,
): Promise<RailResponse | null> => {
  const rows = await findRailByKey(key, brandId);
  if (rows.length === 0) return null;
  const resolved = resolveBrandOverrides(rows);
  if (resolved.length === 0) return null;
  const rail = resolved[0];
  const maps = await buildHydrationMaps([rail], userId, brandId);
  return buildRailResponse(rail, maps);
};

// -----------------------------------------------------------------------------
// Upsert (create or update) a rail with its items
// -----------------------------------------------------------------------------

export interface UpsertRailRequest {
  key: string;
  title: string;
  subtitle?: string | null;
  type: RailType;
  subType?: string | null;
  sourceType: RailSourceType;
  brandId?: number | null;
  order?: number;
  isVisible?: boolean;
  limit?: number;
  seeMore?: RailSeeMoreDescriptor | null;
  // MANUAL: caller-supplied items (tracks/filters/playlists)
  itemCodes?: string[];
  // QUERY (tracks only): filter spec to snapshot
  query?: {
    filterIds?: string[];
    ownerIds?: string[];
    excludeOwnerIds?: string[];
    excludeTiers?: string[];
    // Track filter parameters
    popular?: boolean;
    trending?: boolean;
    newOnHoopr?: boolean;
    movie?: boolean;
    type?: string[];       // owner type filter
    ownerCode?: string[];  // owner code filter
    campaign?: boolean;
    releaseYearFrom?: number;
    releaseYearTo?: number;
  };
  // AI_QUERY (tracks only): external AI call to snapshot
  aiQuery?: {
    url: string;
    body?: Record<string, unknown>;
    headers?: Record<string, string>;
  };
}

export interface UpsertRailResult {
  rail: RailDetails;
  items: RailItemDetails[];
}

const RAIL_TYPE_TO_ITEM_TYPE: Record<RailType, RailItemType> = {
  [RailType.TRACKS]: RailItemType.TRACK,
  [RailType.GENRES]: RailItemType.GENRE,
  [RailType.LANGUAGES]: RailItemType.LANGUAGE,
  [RailType.MOODS]: RailItemType.MOOD,
  [RailType.LABELS]: RailItemType.LABEL,
  [RailType.PLAYLISTS]: RailItemType.PLAYLIST,
};

// Resolve owner IDs from type filter
const resolveOwnerIdsByType = async (
  types?: string[],
): Promise<string[] | undefined> => {
  if (!types || types.length === 0) return undefined;
  const filteredTypes = types.filter((t) => t.trim() !== "");
  if (filteredTypes.length === 0) return undefined;

  const normalize = (str: string) =>
    str.trim().replace(/[\s_]+/g, "").toLowerCase();
  const normalizedTypes = new Set(filteredTypes.map(normalize));
  const allOwners = await OwnerModel.findAll({
    where: { type: { [Op.ne]: null } } as any,
    attributes: ["id", "type"],
  });
  const matchedOwners = allOwners.filter((o) =>
    normalizedTypes.has(normalize(o.type!)),
  );
  const ownerIds = matchedOwners.map((o) => o.id);
  return ownerIds.length > 0 ? ownerIds : [];
};

// Resolve owner IDs from ownerCode filter
const resolveOwnerIdsByOwnerCode = async (
  ownerCodes?: string[],
): Promise<string[] | undefined> => {
  if (!ownerCodes || ownerCodes.length === 0) return undefined;
  const filteredCodes = ownerCodes.map((c) => c.trim()).filter((c) => c !== "");
  if (filteredCodes.length === 0) return undefined;

  const lowerCodes = filteredCodes.map((c) => c.toLowerCase());
  const owners = await OwnerModel.findAll({
    where: where(fn("LOWER", col("ownerCode")), { [Op.in]: lowerCodes }) as any,
    attributes: ["id"],
  });
  const ownerIds = owners.map((o) => o.id);
  return ownerIds.length > 0 ? ownerIds : [];
};

// Intersect two owner ID arrays
const intersectOwnerIds = (
  a: string[] | undefined,
  b: string[] | undefined,
): string[] | undefined => {
  if (!a && !b) return undefined;
  if (!a) return b;
  if (!b) return a;
  const setB = new Set(b);
  return a.filter((id) => setB.has(id));
};

// QUERY path: use findAllTracks with all query parameters or findTracksByFilter
const resolveQueryTracks = async (
  req: UpsertRailRequest,
): Promise<string[]> => {
  if (!req.query) {
    throw new Error("query is required for QUERY source rails");
  }

  const limit = req.limit ?? 10;
  if (limit <= 0 || limit > 200) {
    throw new Error("limit must be between 1 and 200");
  }

  const query = req.query;
  const hasFilterIds = Array.isArray(query.filterIds) && query.filterIds.length > 0;
  const hasTrackFilters = query.popular || query.trending || query.newOnHoopr ||
    query.movie !== undefined || query.campaign || query.type || query.ownerCode ||
    query.releaseYearFrom || query.releaseYearTo;

  // Get excluded owners from brand or from login restrictions
  let excludeOwnerIds: string[] | undefined;
  if (req.brandId) {
    excludeOwnerIds = await getRestrictedOwnersByBrandId(req.brandId);
  } else if (UNAUTHENTICATED_RESTRICTED_OWNER_NAMES.length > 0) {
    const resolvedIds = await getOwnerIdsByNames(UNAUTHENTICATED_RESTRICTED_OWNER_NAMES);
    excludeOwnerIds = resolvedIds.length > 0 ? resolvedIds : undefined;
  }
  // Merge with query.excludeOwnerIds if provided
  if (query.excludeOwnerIds && query.excludeOwnerIds.length > 0) {
    excludeOwnerIds = excludeOwnerIds
      ? [...new Set([...excludeOwnerIds, ...query.excludeOwnerIds])]
      : query.excludeOwnerIds;
  }

  // If filterIds are provided, use findTracksByFilter
  if (hasFilterIds) {
    const result = await findTracksByFilter({
      filterIds: query.filterIds!,
      page: 1,
      limit,
      ownerIds: query.ownerIds,
      excludeOwnerIds,
      excludeTiers: query.excludeTiers,
    });

    const codes: string[] = [];
    for (const row of result.rows ?? []) {
      const track = (row as unknown as { track?: { trackCode?: string } }).track;
      const code = track?.trackCode;
      if (code && !codes.includes(code)) codes.push(code);
    }
    return codes;
  }

  // If no filterIds but has track filters, use findAllTracks
  if (hasTrackFilters) {
    const whereClause: Record<string, unknown> = {};

    if (query.trending === true) {
      whereClause.trending = true;
    }

    if (query.popular === true) {
      whereClause[Op.or as any] = [
        { jioSaavanStream: { [Op.gt]: "0" } },
        { jioSaavanStream: null },
      ];

      // Filter by album type based on movie parameter
      const movieTrackIds = await findTrackIdsByAlbumType("movie");
      if (query.movie === true) {
        if (movieTrackIds.length === 0) return [];
        whereClause.id = { [Op.in]: movieTrackIds };
      } else if (query.movie === false) {
        if (movieTrackIds.length > 0) {
          whereClause.id = { [Op.notIn]: movieTrackIds };
        }
      }
    }

    if (query.newOnHoopr === true) {
      const oneWeekAgo = new Date();
      oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
      whereClause.createdAt = { [Op.gte]: oneWeekAgo };
    }

    if (query.releaseYearFrom || query.releaseYearTo) {
      const releaseDateCondition: any = {};
      if (query.releaseYearFrom) {
        releaseDateCondition[Op.gte] = new Date(`${query.releaseYearFrom}-01-01`);
      }
      if (query.releaseYearTo) {
        releaseDateCondition[Op.lt] = new Date(`${query.releaseYearTo + 1}-01-01`);
      }
      whereClause.releaseDate = releaseDateCondition;
    }

    // Resolve owner IDs from type and ownerCode filters
    const [ownerIdsByType, ownerIdsByCode] = await Promise.all([
      resolveOwnerIdsByType(query.type),
      resolveOwnerIdsByOwnerCode(query.ownerCode),
    ]);
    const ownerIds = intersectOwnerIds(ownerIdsByType, ownerIdsByCode);
    if (ownerIds && ownerIds.length === 0) {
      return [];
    }

    const rawData = await findAllTracks(
      1,
      limit,
      whereClause,
      ownerIds,
      excludeOwnerIds,
      query.popular === true,
      query.campaign === true,
      query.excludeTiers,
    );

    return rawData.rows.map((track) => track.trackCode);
  }

  throw new Error("query must have either filterIds or track filter parameters (popular, trending, newOnHoopr, etc.)");
};

// AI_QUERY path: POST to aiQuery.url, extract data.tracks[].trackCode
const resolveAiQueryTracks = async (
  req: UpsertRailRequest,
): Promise<string[]> => {
  if (!req.aiQuery || !req.aiQuery.url) {
    throw new Error("aiQuery.url is required for AI_QUERY source rails");
  }
  const res = await fetch(req.aiQuery.url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(req.aiQuery.headers ?? {}),
    },
    body: JSON.stringify(req.aiQuery.body ?? {}),
  });
  if (!res.ok) {
    throw new Error(`AI service responded ${res.status}`);
  }
  const json = (await res.json()) as {
    data?: { tracks?: Array<{ trackCode?: string }> };
  };
  const tracks = json?.data?.tracks ?? [];
  const codes: string[] = [];
  for (const t of tracks) {
    if (t?.trackCode && !codes.includes(t.trackCode)) codes.push(t.trackCode);
  }
  return codes;
};

const buildItemsForUpsert = async (
  req: UpsertRailRequest,
): Promise<{ itemType: string; itemCode: string; order: number }[]> => {
  const itemType = RAIL_TYPE_TO_ITEM_TYPE[req.type];

  let codes: string[];
  if (req.sourceType === RailSourceType.MANUAL) {
    if (!Array.isArray(req.itemCodes)) {
      throw new Error("itemCodes is required for MANUAL source rails");
    }
    codes = req.itemCodes.filter((c) => typeof c === "string" && c.length > 0);
  } else if (req.sourceType === RailSourceType.QUERY) {
    if (req.type !== RailType.TRACKS) {
      throw new Error("QUERY sourceType is only valid for TRACKS rails");
    }
    codes = await resolveQueryTracks(req);
  } else if (req.sourceType === RailSourceType.AI_QUERY) {
    if (req.type !== RailType.TRACKS) {
      throw new Error("AI_QUERY sourceType is only valid for TRACKS rails");
    }
    codes = await resolveAiQueryTracks(req);
  } else {
    throw new Error(`Unsupported sourceType: ${req.sourceType}`);
  }

  return codes.map((itemCode, idx) => ({
    itemType,
    itemCode,
    order: idx,
  }));
};

export const upsertRailService = async (
  req: UpsertRailRequest,
): Promise<UpsertRailResult> => {
  const brandId = req.brandId ?? null;

  let order = req.order;
  if (order == null) {
    const existing = await findRailByKeyAndBrand(req.key, brandId);
    if (existing) {
      order = existing.order;
    } else {
      const maxOrder = await getMaxRailOrder(brandId);
      order = maxOrder + 1;
    }
  }

  const items = await buildItemsForUpsert(req);

  const sourceConfig: Record<string, unknown> = {};
  if (req.seeMore) sourceConfig.seeMore = req.seeMore;
  if (req.query) sourceConfig.query = req.query;
  if (req.aiQuery) {
    // Persist url + body for later refresh; headers intentionally omitted (may contain secrets)
    sourceConfig.aiQuery = {
      url: req.aiQuery.url,
      body: req.aiQuery.body ?? {},
    };
  }

  return upsertRailWithItems(
    {
      key: req.key,
      title: req.title,
      subtitle: req.subtitle ?? null,
      type: req.type,
      subType: req.subType ?? null,
      brandId,
      sourceType: req.sourceType,
      sourceConfig: Object.keys(sourceConfig).length ? sourceConfig : null,
      order,
      isVisible: req.isVisible ?? true,
    },
    items,
  );
};
