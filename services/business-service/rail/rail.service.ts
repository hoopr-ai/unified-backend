import { Op } from "sequelize";
import {
  RailType,
  RailSourceType,
  RailItemType,
  RailResponse,
  RailItemResponse,
  RailSeeMoreDescriptor,
  PaginatedRailsResponse,
  UNAUTHENTICATED_RESTRICTED_OWNER_NAMES,
  PageName,
} from "../../dto-service/modules.export";
import {
  RailModel,
  RailItemModel,
  RailDetails,
  RailItemDetails,
  findRailsForBrand,
  findRailsForBrandPaginated,
  findRailByKey,
  findRailByKeyAndBrand,
  findRailByKeyBrandAndPage,
  findRailById,
  getMaxRailOrder,
  getMinRailOrder,
  upsertRailWithItems,
  deleteRailById,
  updateRailItems,
  UpdateRailItemInput,
  bulkUpdateRailOrders,
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
  labels: Map<string, unknown>;
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

const hydrateLabels = async (
  itemCodes: string[],
): Promise<Map<string, unknown>> => {
  const out = new Map<string, unknown>();
  if (itemCodes.length === 0) return out;

  const rows = await OwnerModel.findAll({
    where: {
      ownerCode: { [Op.in]: itemCodes },
    },
    attributes: ["id", "ownerCode", "username", "type", "subType", "category"],
  });

  for (const row of rows) {
    const json = row.toJSON() as unknown as Record<string, unknown>;
    const code = json.ownerCode as string | undefined;
    // Map username to name for consistency
    if (json.username) {
      json.name = json.username;
      delete json.username;
    }
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
  labelCodes: string[];
} => {
  const tracks = new Set<string>();
  const filters = new Set<string>();
  const playlists = new Set<string>();
  const labels = new Set<string>();
  for (const rail of rails) {
    const items = rail.items ?? [];
    for (const item of items) {
      if (item.itemType === RailItemType.TRACK) tracks.add(item.itemCode);
      else if (item.itemType === RailItemType.PLAYLIST) playlists.add(item.itemCode);
      else if (item.itemType === RailItemType.LABEL) labels.add(item.itemCode);
      else filters.add(item.itemCode);
    }
  }
  return {
    trackCodes: Array.from(tracks),
    filterCodes: Array.from(filters),
    playlistCodes: Array.from(playlists),
    labelCodes: Array.from(labels),
  };
};

const buildHydrationMaps = async (
  rails: RailModel[],
  userId?: number,
  brandId?: number,
): Promise<HydrationMaps> => {
  const { trackCodes, filterCodes, playlistCodes, labelCodes } = collectItemCodes(rails);
  const [tracks, filters, playlists, labels] = await Promise.all([
    hydrateTracks(trackCodes, userId, brandId),
    hydrateFilters(filterCodes),
    hydratePlaylists(playlistCodes),
    hydrateLabels(labelCodes),
  ]);
  return { tracks, filters, playlists, labels };
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
  if (item.itemType === RailItemType.LABEL) {
    return maps.labels.get(item.itemCode) ?? null;
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
  itemLimit?: number,
): RailResponse => {
  let items = (rail.items ?? [])
    .slice()
    .sort((a, b) => a.order - b.order)
    .map<RailItemResponse>((item) => ({
      itemType: item.itemType,
      itemCode: item.itemCode,
      order: item.order,
      data: resolveItem(item, maps),
    }))
    .filter((entry) => entry.data !== null);

  // Apply item limit if specified
  if (itemLimit && itemLimit > 0 && items.length > itemLimit) {
    items = items.slice(0, itemLimit);
  }

  return {
    id: rail.id,
    key: rail.key,
    title: rail.title,
    subtitle: rail.subtitle ?? null,
    type: rail.type,
    subType: rail.subType ?? null,
    sourceType: rail.sourceType,
    pageName: rail.pageName,
    order: rail.order,
    items,
    seeMore: extractSeeMore(rail),
  };
};

// -----------------------------------------------------------------------------
// Brand Recommended Rail - AI-powered personalized recommendations per brand
// -----------------------------------------------------------------------------

const BRAND_RECOMMENDED_RAIL_KEY_PREFIX = "brand_recommended_";
const AI_SERVICE_BRAND_RECOMMEND_URL = `${process.env.AI_SERVICE_URL}/smash/brandRecommend`;

interface BrandRecommendTrack {
  id: string;
  trackCode: string;
  name: string;
}

interface BrandRecommendResponse {
  data?: {
    brand_id: number;
    brand_name: string;
    tracks?: BrandRecommendTrack[];
    pagination?: {
      has_more: boolean;
      limit: number;
      page: number;
    };
  };
}

const fetchBrandRecommendations = async (
  brandId: number,
  limit: number = 40,
  page: number = 1,
): Promise<string[]> => {
  try {
    console.log(`[BrandRecommend] Calling AI API: ${AI_SERVICE_BRAND_RECOMMEND_URL} with brand_id=${brandId}`);

    const response = await fetch(AI_SERVICE_BRAND_RECOMMEND_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json, text/plain, */*",
      },
      body: JSON.stringify({
        brand_id: String(brandId),
        limit,
        page,
      }),
    });

    console.log(`[BrandRecommend] AI API response status: ${response.status}`);

    if (!response.ok) {
      console.error(`[BrandRecommend] API error - status ${response.status}`);
      return [];
    }

    const json = (await response.json()) as BrandRecommendResponse;
    const tracks = json?.data?.tracks ?? [];
    console.log(`[BrandRecommend] Received ${tracks.length} tracks from API`);

    // Extract track codes from the response
    const trackCodes: string[] = [];
    for (const track of tracks) {
      if (track?.trackCode && !trackCodes.includes(track.trackCode)) {
        trackCodes.push(track.trackCode);
      }
    }
    console.log(`[BrandRecommend] Extracted ${trackCodes.length} valid trackCodes`);
    return trackCodes;
  } catch (error) {
    console.error("[BrandRecommend] Error fetching brand recommendations:", error);
    return [];
  }
};

const ensureBrandRecommendedRail = async (
  userBrandId: number,
  pageName: string = "HOME",
): Promise<void> => {
  const railKey = `${BRAND_RECOMMENDED_RAIL_KEY_PREFIX}${userBrandId}`;
  console.log(`[BrandRecommend] Checking rail for brandId=${userBrandId}, key=${railKey}, pageName=${pageName}`);

  // Check if the rail already exists for this brand and page
  const existingRail = await findRailByKeyBrandAndPage(railKey, userBrandId, pageName as PageName);
  if (existingRail) {
    console.log(`[BrandRecommend] Rail already exists, skipping creation`);
    return;
  }

  console.log(`[BrandRecommend] Rail not found, fetching from AI server: ${AI_SERVICE_BRAND_RECOMMEND_URL}`);

  // Fetch recommendations from AI server
  const trackCodes = await fetchBrandRecommendations(userBrandId);
  console.log(`[BrandRecommend] AI server returned ${trackCodes.length} tracks`);

  if (trackCodes.length === 0) {
    console.log(`[BrandRecommend] No tracks returned, skipping rail creation`);
    return;
  }

  // Get the minimum order to place this rail at the top (page-wise)
  const minOrder = await getMinRailOrder(userBrandId, pageName as PageName);
  const newOrder = minOrder - 1; // Place it above the current top rail

  // Create the rail with items
  const items = trackCodes.map((trackCode, idx) => ({
    itemType: RailItemType.TRACK,
    itemCode: trackCode,
    order: idx,
  }));

  try {
    console.log(`[BrandRecommend] Creating rail with key=${railKey}, brandId=${userBrandId}, pageName=${pageName}, order=${newOrder}, items=${items.length}`);
    const result = await upsertRailWithItems(
      {
        key: railKey,
        title: "Recommended For You",
        subtitle: null,
        type: RailType.TRACKS,
        subType: null,
        brandId: userBrandId,
        pageName: pageName as PageName,
        sourceType: RailSourceType.MANUAL,
        sourceConfig: {
          source: "brand_recommend_ai",
          createdAt: new Date().toISOString(),
        },
        order: newOrder,
        isVisible: true,
      },
      items,
    );
    console.log(`[BrandRecommend] Rail created successfully! railId=${result.rail.id}, itemsCreated=${result.items.length}`);
  } catch (error) {
    console.error(`[BrandRecommend] Error creating rail:`, error);
  }
};

export const getRailsService = async (
  brandId?: number,
  userId?: number,
  pageName?: string,
): Promise<RailResponse[]> => {
  // Ensure brand recommended rail exists for the logged-in user's brand
  if (brandId) {
    await ensureBrandRecommendedRail(brandId, pageName ?? "HOME");
  }

  // Use the user's brandId for fetching rails (not URL brandId)
  const effectiveBrandId = brandId ?? brandId;

  const raw = await findRailsForBrand(effectiveBrandId, pageName);
  const resolved = resolveBrandOverrides(raw);
  const maps = await buildHydrationMaps(resolved, userId, brandId);
  return resolved.map((rail) => buildRailResponse(rail, maps));
};

export const getRailsPaginatedService = async (
  brandId?: number,
  userId?: number,
  pageName?: string,
  page: number = 1,
  limit: number = 10,
  railItemLimit?: number,
): Promise<PaginatedRailsResponse> => {
  // Ensure brand recommended rail exists for the logged-in user's brand
  // Use the user's brandId from their profile, not from URL query
  if (brandId) {
    await ensureBrandRecommendedRail(brandId, pageName ?? "HOME");
  }

  // Use the user's brandId for fetching rails (not URL brandId)
  // This ensures brand_recommended rail created for userBrandId is included
  const effectiveBrandId = brandId;

  const { rows: raw, count: total } = await findRailsForBrandPaginated(
    effectiveBrandId,
    pageName,
    page,
    limit,
  );
  const resolved = resolveBrandOverrides(raw);
  const maps = await buildHydrationMaps(resolved, userId, brandId);
  const rails = resolved.map((rail) => buildRailResponse(rail, maps, railItemLimit));

  const totalPages = Math.ceil(total / limit);

  return {
    rails,
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasMore: page < totalPages,
    },
  };
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
  pageNames?: PageName[];  // Multiple pages = multiple rails created (one per page)
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
    queryType: 'TRENDING' | 'POPULAR' | 'FILTERED' | 'NEW_AGE_ICONS';
    // For TRENDING/POPULAR: limit and brandId are used
    limit?: number;
    // For FILTERED: additional search parameters
    q?: string;
    brandName?: string;
    userId?: string;
    filters?: Array<{
      type: 'genre' | 'mood' | 'language' | 'usecase' | 'assortment';
      value: string[];
    }>;
    page?: number;
    // Legacy support: direct url/body/headers
    url?: string;
    body?: Record<string, unknown>;
    headers?: Record<string, string>;
  };
}

// Result for a single rail upsert
export interface SingleRailUpsertResult {
  rail: RailDetails;
  items: RailItemDetails[];
}

// Result for upsert (can contain multiple rails if multiple pages specified)
export interface UpsertRailsResult {
  rails: SingleRailUpsertResult[];
}

// Legacy result type for backwards compatibility
export interface UpsertRailResult {
  rail: RailDetails;
  items: RailItemDetails[];
  // When multiple pages, additional rails are in this array
  additionalRails?: SingleRailUpsertResult[];
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

// AI_QUERY path: call AI service based on queryType
const resolveAiQueryTracks = async (
  req: UpsertRailRequest,
): Promise<string[]> => {
  if (!req.aiQuery) {
    throw new Error("aiQuery is required for AI_QUERY source rails");
  }

  const aiServiceUrl = process.env.AI_SERVICE_URL;
  const aiQuery = req.aiQuery;

  let url: string;
  let method: string = "GET";
  let body: string | undefined;
  let headers: Record<string, string> = {};

  if (aiQuery.queryType === 'TRENDING') {
    // GET /smash/trendingSongs?limit=X&brandId=Y
    if (!aiServiceUrl) {
      throw new Error("AI_SERVICE_URL environment variable is required for TRENDING query");
    }
    const params = new URLSearchParams();
    params.set('limit', String(aiQuery.limit ?? 40));
    if (req.brandId) params.set('brandId', String(req.brandId));
    url = `${aiServiceUrl}/smash/trendingSongs?${params.toString()}`;
    if (aiQuery.headers) headers = { ...headers, ...aiQuery.headers };
  } else if (aiQuery.queryType === 'POPULAR') {
    // GET /smash/popularSongs?limit=X&brandId=Y
    if (!aiServiceUrl) {
      throw new Error("AI_SERVICE_URL environment variable is required for POPULAR query");
    }
    const params = new URLSearchParams();
    params.set('limit', String(aiQuery.limit ?? 40));
    if (req.brandId) params.set('brandId', String(req.brandId));
    url = `${aiServiceUrl}/smash/popularSongs?${params.toString()}`;
    if (aiQuery.headers) headers = { ...headers, ...aiQuery.headers };
  } else if (aiQuery.queryType === 'FILTERED') {
    // POST /smash/aienterpriseSearch with body
    if (!aiServiceUrl) {
      throw new Error("AI_SERVICE_URL environment variable is required for FILTERED query");
    }
    method = "POST";
    headers["Content-Type"] = "application/json";
    if (aiQuery.headers) headers = { ...headers, ...aiQuery.headers };

    const requestBody: Record<string, unknown> = {
      q: aiQuery.q ?? "",
      brandId: req.brandId ? String(req.brandId) : undefined,
      brandName: aiQuery.brandName ?? "",
      userId: aiQuery.userId ?? "",
      filters: aiQuery.filters ?? [],
      limit: aiQuery.limit ?? 200,
      page: aiQuery.page ?? 1,
    };
    body = JSON.stringify(requestBody);
    url = `${aiServiceUrl}/smash/aienterpriseSearch`;
  } else if (aiQuery.queryType === 'NEW_AGE_ICONS') {
    // POST /smash/curatedArtistTracks - New Age Icons (auth optional)
    method = "POST";
    headers["Content-Type"] = "application/json";
    headers["Accept"] = "application/json, text/plain, */*";
    if (aiQuery.headers) headers = { ...headers, ...aiQuery.headers };

    const requestBody: Record<string, unknown> = {
      limit: aiQuery.limit ?? 40,
      page: aiQuery.page ?? 1,
    };
    body = JSON.stringify(requestBody);
    url = `${aiServiceUrl}/smash/curatedArtistTracks`;
  } else if (aiQuery.url) {
    // Legacy: direct URL provided
    url = aiQuery.url;
    method = "POST";
    headers["Content-Type"] = "application/json";
    if (aiQuery.headers) headers = { ...headers, ...aiQuery.headers };
    body = JSON.stringify(aiQuery.body ?? {});
  } else {
    throw new Error("aiQuery.queryType or aiQuery.url is required for AI_QUERY source rails");
  }

  const fetchOptions: RequestInit = { method, headers };
  if (body) fetchOptions.body = body;

  const res = await fetch(url, fetchOptions);
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
  const pageNames = req.pageNames ?? [PageName.HOME];

  // Build items once (same items for all pages)
  const items = await buildItemsForUpsert(req);

  // Build sourceConfig once
  const sourceConfig: Record<string, unknown> = {};
  if (req.seeMore) sourceConfig.seeMore = req.seeMore;
  if (req.query) sourceConfig.query = req.query;
  if (req.aiQuery) {
    // Persist aiQuery config for later refresh; headers intentionally omitted (may contain secrets)
    const aiQueryConfig: Record<string, unknown> = {};
    if (req.aiQuery.queryType) aiQueryConfig.queryType = req.aiQuery.queryType;
    if (req.aiQuery.limit) aiQueryConfig.limit = req.aiQuery.limit;
    if (req.aiQuery.q) aiQueryConfig.q = req.aiQuery.q;
    if (req.aiQuery.brandName) aiQueryConfig.brandName = req.aiQuery.brandName;
    if (req.aiQuery.userId) aiQueryConfig.userId = req.aiQuery.userId;
    if (req.aiQuery.filters) aiQueryConfig.filters = req.aiQuery.filters;
    if (req.aiQuery.page) aiQueryConfig.page = req.aiQuery.page;
    // Legacy support
    if (req.aiQuery.url) aiQueryConfig.url = req.aiQuery.url;
    if (req.aiQuery.body) aiQueryConfig.body = req.aiQuery.body;
    sourceConfig.aiQuery = aiQueryConfig;
  }

  const finalSourceConfig = Object.keys(sourceConfig).length ? sourceConfig : null;

  // Create a separate rail for each page
  const results: SingleRailUpsertResult[] = [];

  for (const pageName of pageNames) {
    // Determine order for this page
    let order = req.order;
    if (order == null) {
      const existing = await findRailByKeyBrandAndPage(req.key, brandId, pageName);
      if (existing) {
        order = existing.order;
      } else {
        const maxOrder = await getMaxRailOrder(brandId, pageName);
        order = maxOrder + 1;
      }
    }

    const result = await upsertRailWithItems(
      {
        key: req.key,
        title: req.title,
        subtitle: req.subtitle ?? null,
        type: req.type,
        subType: req.subType ?? null,
        brandId,
        pageName,
        sourceType: req.sourceType,
        sourceConfig: finalSourceConfig,
        order,
        isVisible: req.isVisible ?? true,
      },
      items,
    );
    results.push(result);
  }

  // Return first rail as primary result, additional rails in separate array
  const [first, ...rest] = results;
  return {
    rail: first.rail,
    items: first.items,
    additionalRails: rest.length > 0 ? rest : undefined,
  };
};

// -----------------------------------------------------------------------------
// Delete a rail by ID (hard delete)
// -----------------------------------------------------------------------------

export const deleteRailService = async (
  railId: number,
): Promise<boolean> => {
  const rail = await findRailById(railId);
  if (!rail) {
    return false;
  }
  return deleteRailById(railId);
};

// -----------------------------------------------------------------------------
// Edit rail items (delete, freeze/unfreeze, reorder, add new items)
// -----------------------------------------------------------------------------

export interface EditRailItemsRequest {
  items: Array<{
    id?: number;           // Existing item ID (omit for new items)
    itemCode: string;      // Track code, filter ID, playlist code, etc.
    order: number;         // New order position
    isLocked?: boolean;    // Freeze/unfreeze the item
  }>;
}

export interface EditRailItemsResult {
  railId: number;
  items: RailItemDetails[];
}

export const editRailItemsService = async (
  railId: number,
  req: EditRailItemsRequest,
): Promise<EditRailItemsResult | null> => {
  // Verify rail exists
  const rail = await findRailById(railId);
  if (!rail) {
    return null;
  }

  // Get the item type from the rail type
  const itemType = RAIL_TYPE_TO_ITEM_TYPE[rail.type as RailType];
  if (!itemType) {
    throw new Error(`Unknown rail type: ${rail.type}`);
  }

  // Build items for update
  const itemsToUpdate: UpdateRailItemInput[] = req.items.map((item) => ({
    id: item.id,
    itemType,
    itemCode: item.itemCode,
    order: item.order,
    isLocked: item.isLocked ?? false,
  }));

  const updatedItems = await updateRailItems(railId, itemsToUpdate);

  return {
    railId,
    items: updatedItems,
  };
};

// -----------------------------------------------------------------------------
// Reorder rails (bulk update order values) - page-wise
// -----------------------------------------------------------------------------

export interface ReorderRailsRequest {
  pageName: PageName;  // Required: which page to reorder rails for
  railOrders: Array<{
    id: number;
    order: number;
  }>;
}

export const reorderRailsService = async (
  req: ReorderRailsRequest,
): Promise<{ updated: number; pageName: PageName }> => {
  if (!req.railOrders || req.railOrders.length === 0) {
    return { updated: 0, pageName: req.pageName };
  }

  // Validate that all rails belong to the specified page
  const railIds = req.railOrders.map(r => r.id);
  const rails = await RailModel.findAll({
    where: { id: { [Op.in]: railIds } },
    attributes: ['id', 'pageName', 'brandId'],
  });

  const invalidRails = rails.filter(r => r.pageName !== req.pageName);
  if (invalidRails.length > 0) {
    throw new Error(`Rails ${invalidRails.map(r => r.id).join(', ')} do not belong to page ${req.pageName}`);
  }

  // Get unique brandIds for cache invalidation
  const brandIds = [...new Set(rails.map(r => r.brandId))];

  await bulkUpdateRailOrders(req.railOrders, req.pageName, brandIds[0]);
  return { updated: req.railOrders.length, pageName: req.pageName };
};
