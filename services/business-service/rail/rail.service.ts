import { Op } from "sequelize";
import {
  RailType,
  RailSourceType,
  RailItemType,
  RailResponse,
  RailItemResponse,
  RailSeeMoreDescriptor,
  PaginatedRailsResponse,
  RailSeeAllResponse,
  UNAUTHENTICATED_RESTRICTED_OWNER_NAMES,
  PageName,
  OwnerType,
  isOwnerTypeAllowedForPage,
  getAllowedOwnerTypesForPage,
  itemTypeHasOwnerRestriction,
  isManualOnlyPage,
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
  findRailByIdWithoutItems,
  findRailItemsPaginated,
  getMaxRailOrder,
  getMinRailOrder,
  upsertRailWithItems,
  deleteRailById,
  updateRailItems,
  UpdateRailItemInput,
  bulkUpdateRailOrders,
  updateRailMode,
  findTracksByTrackCodes,
  findTracksByFilter,
  findAllTracks,
  findTrackIdsByAlbumType,
  findTracksLightweight,
  findChartTrackCodes,
  ChartTrackSource,
  FilterModel,
  PlaylistModel,
  getRestrictedOwnersByBrandId,
  getOwnerIdsByNames,
  findAlbumByTrackId,
  copyRailToPages,
  CopyRailResult,
  getActiveBrandTokenTypes,
} from "../../persistence-service/exports";
import { OwnerModel } from "../../persistence-service/owner/modules.export";
import { ArtistModel } from "../../persistence-service/artists/modules.export";
import { SkuModel } from "../../persistence-service/sku/schemas/sku.schema";
import { fn, col, where } from "sequelize";
import { getUserLikedTrackCodes } from "../../persistence-service/user/liked-track.persistence.service";
import { transformRawTracksToDto } from "../track/track.service";
import { toCdnUrl } from "../../helper-service/cdn.helper";

// -----------------------------------------------------------------------------
// Brand Recommendation Filter Configuration per Page
// -----------------------------------------------------------------------------

interface BrandRecommendFilter {
  type: "assortment" | "language" | "vocals";
  value: string[] | string;
}

const PAGE_RECOMMENDATION_FILTERS: Record<PageName, BrandRecommendFilter[]> = {
  [PageName.HOME]: [],
  [PageName.CHARTBUSTERS]: [
    { type: "assortment", value: ["chartbusters"] },
    { type: "language", value: ["hindi", "punjabi"] },
  ],
  [PageName.INTERNATIONAL]: [
    { type: "assortment", value: ["International"] },
  ],
  [PageName.REGIONAL_AND_INDIE]: [
    { type: "assortment", value: ["Regional&Indie"] },
  ],
  [PageName.HOOPR_ORIGINALS]: [
    { type: "assortment", value: ["hooproriginals"] },
  ],
  [PageName.APP_HOME]: [],
  [PageName.HOOPR_PLAYLIST]: [],
};

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
  artists: Map<string, unknown>;
}

const hydrateTracks = async (
  trackCodes: string[],
  userId?: number,
  brandId?: number,
): Promise<Map<string, unknown>> => {
  if (trackCodes.length === 0) return new Map();

  // Get excluded owners and token types together before the main fetch
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

  // Get liked tracks and SKUs in parallel with track fetch
  const [tracksMap, likedCodes, skuRows] = await Promise.all([
    findTracksLightweight(trackCodes, excludeOwnerIds),
    userId ? getUserLikedTrackCodes(userId) : Promise.resolve([]),
    SkuModel.findAll({
      where: { trackCode: { [Op.in]: trackCodes } },
      attributes: ["trackCode", "id", "costPrice", "sellingPrice"],
      raw: true,
    }),
  ]);

  // Build SKU map keyed by trackCode
  const skuMap = new Map<string, { id: string; costPrice?: number; sellingPrice?: number }>();
  for (const sku of skuRows) {
    if (!skuMap.has(sku.trackCode)) {
      skuMap.set(sku.trackCode, { id: sku.id, costPrice: sku.costPrice, sellingPrice: sku.sellingPrice });
    }
  }

  const likedSet = new Set(likedCodes);

  // Collect all owner IDs from tracks to fetch owner details
  const allOwnerIds: string[] = [];
  for (const [, track] of tracksMap) {
    if (track.ownerId && Array.isArray(track.ownerId)) {
      allOwnerIds.push(...track.ownerId);
    }
  }
  const uniqueOwnerIds = [...new Set(allOwnerIds)];

  // Fetch owner details (type, subType, code)
  const ownerTypeMap = new Map<string, string>();
  const ownerSubTypeMap = new Map<string, string>();
  const ownerCodeMap = new Map<string, string>();
  if (uniqueOwnerIds.length > 0) {
    const owners = await OwnerModel.findAll({
      where: { id: { [Op.in]: uniqueOwnerIds } },
      attributes: ["id", "type", "subType", "ownerCode"],
    });
    for (const owner of owners) {
      if (owner.type) ownerTypeMap.set(owner.id, owner.type);
      if (owner.subType) ownerSubTypeMap.set(owner.id, owner.subType);
      if (owner.ownerCode) ownerCodeMap.set(owner.id, owner.ownerCode);
    }
  }

  // Fetch album details for each track
  const albumMap = new Map<string, { id: string; title?: string; type?: string }>();
  const trackIds = Array.from(tracksMap.values()).map((t) => t.id);
  const albumPromises = trackIds.map(async (trackId) => {
    const album = await findAlbumByTrackId(trackId);
    if (album) {
      albumMap.set(trackId, {
        id: album.id,
        title: album.title,
        type: album.type as string | undefined,
      });
    }
  });
  await Promise.all(albumPromises);

  // Transform to response format (matching getAllTracks API structure)
  const result = new Map<string, unknown>();
  for (const [code, track] of tracksMap) {
    // Get ownerType, ownerSubType, ownerCode from the first matching owner
    let ownerType: string | undefined;
    let ownerSubType: string | undefined;
    let ownerCode: string | undefined;
    if (track.ownerId && Array.isArray(track.ownerId)) {
      for (const oid of track.ownerId) {
        if (!ownerType && ownerTypeMap.get(oid)) ownerType = ownerTypeMap.get(oid);
        if (!ownerSubType && ownerSubTypeMap.get(oid)) ownerSubType = ownerSubTypeMap.get(oid);
        if (!ownerCode && ownerCodeMap.get(oid)) ownerCode = ownerCodeMap.get(oid);
        if (ownerType && ownerSubType && ownerCode) break;
      }
    }

    const isEnterpriseOnly = ownerType === "Chartbusters" && !activeTokenTypes.has("Chartbusters");
    const hasTokenForTrack = ownerType ? activeTokenTypes.has(ownerType) : false;
    const hidePrice = isEnterpriseOnly || hasTokenForTrack;
    const skuData = skuMap.get(track.trackCode);
    const sku = skuData
      ? {
          id: skuData.id,
          costPrice: hidePrice ? undefined : skuData.costPrice,
          sellingPrice: hidePrice ? undefined : skuData.sellingPrice,
        }
      : undefined;

    const trackData: Record<string, unknown> = {
      id: track.id,
      trackCode: track.trackCode,
      name: track.name,
      name_slug: track.name_slug,
      waveformLink: toCdnUrl(track.waveformLink),
      mp3Link: toCdnUrl(track.mp3Link),
      hasVocals: track.hasVocals,
      trending: track.trending,
      hookTimings: track.hookTimings,
      primaryArtists: track.primaryArtists,
      isLiked: likedSet.has(track.trackCode),
      ...(hasTokenForTrack && { token: 1 }),
    };

    // Add optional fields if they exist (matching getAllTracks API)
    if (ownerType) trackData.ownerType = ownerType;
    if (ownerSubType) trackData.ownerSubType = ownerSubType;
    if (ownerCode) trackData.ownerCode = ownerCode;
    if (isEnterpriseOnly) trackData.isEnterpriseOnly = true;
    if (sku) trackData.sku = sku;
    if (albumMap.has(track.id)) trackData.album = albumMap.get(track.id);

    result.set(code, trackData);
  }
  return result;
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

  // Filter to only valid UUIDs for the id comparison
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const uuidCodes = itemCodes.filter(code => uuidRegex.test(code));

  const rows = await PlaylistModel.findAll({
    where: {
      [Op.or]: uuidCodes.length > 0
        ? [
            { playlistCode: { [Op.in]: itemCodes } },
            { id: { [Op.in]: uuidCodes } },
          ]
        : [{ playlistCode: { [Op.in]: itemCodes } }],
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

const hydrateArtists = async (
  itemCodes: string[],
): Promise<Map<string, unknown>> => {
  const out = new Map<string, unknown>();
  if (itemCodes.length === 0) return out;

  const rows = await ArtistModel.findAll({
    where: {
      artistCode: { [Op.in]: itemCodes },
    },
    attributes: ["id", "artistCode", "name", "name_slug", "type"],
  });

  for (const row of rows) {
    const json = row.toJSON() as unknown as Record<string, unknown>;
    const code = json.artistCode as string | undefined;
    // Image is derived client-side from artistCode (CDN-by-code convention),
    // mirroring how tracks/playlists handle artwork without an uploaded image.
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
  artistCodes: string[];
} => {
  const tracks = new Set<string>();
  const filters = new Set<string>();
  const playlists = new Set<string>();
  const labels = new Set<string>();
  const artists = new Set<string>();
  for (const rail of rails) {
    const items = rail.items ?? [];
    for (const item of items) {
      if (item.itemType === RailItemType.TRACK) tracks.add(item.itemCode);
      else if (item.itemType === RailItemType.PLAYLIST) playlists.add(item.itemCode);
      else if (item.itemType === RailItemType.LABEL) labels.add(item.itemCode);
      else if (item.itemType === RailItemType.ARTIST) artists.add(item.itemCode);
      else filters.add(item.itemCode);
    }
  }
  return {
    trackCodes: Array.from(tracks),
    filterCodes: Array.from(filters),
    playlistCodes: Array.from(playlists),
    labelCodes: Array.from(labels),
    artistCodes: Array.from(artists),
  };
};

const buildHydrationMaps = async (
  rails: RailModel[],
  userId?: number,
  brandId?: number,
): Promise<HydrationMaps> => {
  const { trackCodes, filterCodes, playlistCodes, labelCodes, artistCodes } = collectItemCodes(rails);
  const [tracks, filters, playlists, labels, artists] = await Promise.all([
    hydrateTracks(trackCodes, userId, brandId),
    hydrateFilters(filterCodes),
    hydratePlaylists(playlistCodes),
    hydrateLabels(labelCodes),
    hydrateArtists(artistCodes),
  ]);
  return { tracks, filters, playlists, labels, artists };
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
  if (item.itemType === RailItemType.ARTIST) {
    return maps.artists.get(item.itemCode) ?? null;
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

// Get owner type from hydrated item data
const getOwnerTypeFromItemData = (itemType: string, data: unknown): string | null => {
  if (!data || typeof data !== "object") return null;
  const record = data as Record<string, unknown>;

  if (itemType === RailItemType.TRACK) {
    // Track has ownerType field from hydration
    return (record.ownerType as string) ?? null;
  }

  if (itemType === RailItemType.LABEL) {
    // Label has type field (owner type)
    return (record.type as string) ?? null;
  }

  return null;
};

// Filter items based on page owner type restrictions
const filterItemsByPageOwnerType = (
  items: RailItemResponse[],
  pageName: PageName,
): RailItemResponse[] => {
  const allowedTypes = getAllowedOwnerTypesForPage(pageName);

  // HOME allows all types
  if (allowedTypes === null) return items;

  return items.filter((item) => {
    // Only TRACK and LABEL have owner type restrictions
    if (!itemTypeHasOwnerRestriction(item.itemType)) {
      return true;
    }

    const ownerType = getOwnerTypeFromItemData(item.itemType, item.data);

    // If owner type is not set, allow it (backwards compatibility)
    if (!ownerType) return true;

    return allowedTypes.includes(ownerType as OwnerType);
  });
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

  // Filter items by owner type for restricted pages (INTERNATIONAL, CHARTBUSTERS, etc.)
  // HOME page has no restrictions
  items = filterItemsByPageOwnerType(items, rail.pageName as PageName);

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
    populateMode: rail.populateMode ?? "MANUAL",
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
  filters: BrandRecommendFilter[] = [],
  limit: number = 50,
  page: number = 1,
): Promise<string[]> => {
  try {
    const requestBody: Record<string, unknown> = {
      brand_id: String(brandId),
      limit,
      page,
    };

    if (filters.length > 0) {
      requestBody.filters = filters;
    }

    console.log(`[BrandRecommend] Calling AI API: ${AI_SERVICE_BRAND_RECOMMEND_URL} with brand_id=${brandId}, filters=${JSON.stringify(filters)}`);

    const response = await fetch(AI_SERVICE_BRAND_RECOMMEND_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json, text/plain, */*",
      },
      body: JSON.stringify(requestBody),
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
  const pageNameEnum = pageName as PageName;

  // Check for existing rail with any of the possible key formats
  // Old format: brand_recommended_{brandId}
  // New format: brand_recommended_{brandId}_{pageName}
  const possibleKeys = [
    `${BRAND_RECOMMENDED_RAIL_KEY_PREFIX}${userBrandId}`,           // old format
    `${BRAND_RECOMMENDED_RAIL_KEY_PREFIX}${userBrandId}_${pageName}`, // new format
  ];

  console.log(`[BrandRecommend] Checking rail for brandId=${userBrandId}, pageName=${pageName}, possibleKeys=${possibleKeys.join(', ')}`);

  // Check if any rail already exists for this brand and page with any key format
  const existingRail = await RailModel.findOne({
    where: {
      key: { [Op.in]: possibleKeys },
      brandId: userBrandId,
      pageName: pageNameEnum,
    },
  });

  if (existingRail) {
    console.log(`[BrandRecommend] Rail already exists with key=${existingRail.key}, skipping creation`);
    return;
  }

  // Get page-specific filters for the recommendation API
  const filters = PAGE_RECOMMENDATION_FILTERS[pageNameEnum] ?? [];
  console.log(`[BrandRecommend] Rail not found, fetching from AI server: ${AI_SERVICE_BRAND_RECOMMEND_URL} with filters: ${JSON.stringify(filters)}`);

  // Fetch recommendations from AI server with page-specific filters
  const trackCodes = await fetchBrandRecommendations(userBrandId, filters);
  console.log(`[BrandRecommend] AI server returned ${trackCodes.length} tracks`);

  if (trackCodes.length === 0) {
    console.log(`[BrandRecommend] No tracks returned, skipping rail creation`);
    return;
  }

  // Get the minimum order to place this rail at the top (page-wise)
  const minOrder = await getMinRailOrder(userBrandId, pageNameEnum);
  const newOrder = minOrder - 1; // Place it above the current top rail

  // Use new format key with pageName for new rails
  const railKey = `${BRAND_RECOMMENDED_RAIL_KEY_PREFIX}${userBrandId}_${pageName}`;

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
        pageName: pageNameEnum,
        sourceType: RailSourceType.MANUAL,
        sourceConfig: {
          source: "brand_recommend_ai",
          pageName: pageName,
          filters: filters,
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
    queryType: 'TRENDING' | 'POPULAR' | 'FILTERED' | 'NEW_AGE_ICONS' | 'BRAND_RECOMMENDED';
    // For TRENDING/POPULAR: limit and brandId are used
    limit?: number;
    // For FILTERED: additional search parameters
    q?: string;
    brandName?: string;
    userId?: string;
    filters?: Array<{
      type: 'genre' | 'mood' | 'language' | 'usecase' | 'assortment' | 'vocals';
      value: string[] | string;
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
  [RailType.ARTISTS]: RailItemType.ARTIST,
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
    const [brandExcludeOwnerIds, tokenTypes, defaultRestrictedIds] = await Promise.all([
      getRestrictedOwnersByBrandId(req.brandId),
      getActiveBrandTokenTypes(req.brandId),
      UNAUTHENTICATED_RESTRICTED_OWNER_NAMES.length > 0
        ? getOwnerIdsByNames(UNAUTHENTICATED_RESTRICTED_OWNER_NAMES)
        : Promise.resolve([]),
    ]);
    const defaultRestricted = tokenTypes.has("Chartbusters") ? [] : defaultRestrictedIds;
    const combined = [...(brandExcludeOwnerIds || []), ...defaultRestricted];
    excludeOwnerIds = combined.length > 0 ? combined : undefined;
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

// Resolve track codes for TRENDING/POPULAR rails from the chart_tracks table.
// Replaces former AI calls to /smash/trendingSongs and /smash/popularSongs.
// - Orders by chart_rank ASC (1 = highest)
// - Filters out tracks belonging to brand-restricted owners
// - Filters out inactive tracks (handled by findChartTrackCodes + findTracksLightweight)
export const resolveChartTracks = async (
  source: ChartTrackSource,
  limit: number,
  brandId?: number | null,
  offset: number = 0,
): Promise<string[]> => {
  if (limit <= 0) return [];

  let excludeOwnerIds: string[] | undefined;
  if (brandId) {
    const [brandExcludeOwnerIds, tokenTypes, defaultRestrictedIds] = await Promise.all([
      getRestrictedOwnersByBrandId(brandId),
      getActiveBrandTokenTypes(brandId),
      UNAUTHENTICATED_RESTRICTED_OWNER_NAMES.length > 0
        ? getOwnerIdsByNames(UNAUTHENTICATED_RESTRICTED_OWNER_NAMES)
        : Promise.resolve([]),
    ]);
    const defaultRestricted = tokenTypes.has("Chartbusters") ? [] : defaultRestrictedIds;
    const combined = [...(brandExcludeOwnerIds || []), ...defaultRestricted];
    excludeOwnerIds = combined.length > 0 ? combined : undefined;
  } else if (UNAUTHENTICATED_RESTRICTED_OWNER_NAMES.length > 0) {
    const resolvedIds = await getOwnerIdsByNames(UNAUTHENTICATED_RESTRICTED_OWNER_NAMES);
    excludeOwnerIds = resolvedIds.length > 0 ? resolvedIds : undefined;
  }

  // Over-fetch to absorb tracks dropped by brand exclusion
  const fetchSize = Math.min(500, limit * 3 + 50);
  const candidateCodes = await findChartTrackCodes(source, fetchSize, offset);
  if (candidateCodes.length === 0) return [];

  const allowed = await findTracksLightweight(candidateCodes, excludeOwnerIds);

  const ordered: string[] = [];
  for (const code of candidateCodes) {
    if (allowed.has(code)) {
      ordered.push(code);
      if (ordered.length >= limit) break;
    }
  }
  return ordered;
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

  // TRENDING/POPULAR are now sourced from the chart_tracks table (no external AI call)
  if (aiQuery.queryType === 'TRENDING') {
    return resolveChartTracks(ChartTrackSource.TRENDING, aiQuery.limit ?? 40, req.brandId);
  }
  if (aiQuery.queryType === 'POPULAR') {
    return resolveChartTracks(ChartTrackSource.POPULAR, aiQuery.limit ?? 40, req.brandId);
  }

  let url: string;
  let method: string = "GET";
  let body: string | undefined;
  let headers: Record<string, string> = {};

  if (aiQuery.queryType === 'FILTERED') {
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
  } else if (aiQuery.queryType === 'BRAND_RECOMMENDED') {
    // POST /smash/brandRecommend - Brand-specific recommendations with filters
    if (!aiServiceUrl) {
      throw new Error("AI_SERVICE_URL environment variable is required for BRAND_RECOMMENDED query");
    }
    if (!req.brandId) {
      throw new Error("brandId is required for BRAND_RECOMMENDED query");
    }
    method = "POST";
    headers["Content-Type"] = "application/json";
    headers["Accept"] = "application/json, text/plain, */*";
    if (aiQuery.headers) headers = { ...headers, ...aiQuery.headers };

    const requestBody: Record<string, unknown> = {
      brand_id: String(req.brandId),
      limit: aiQuery.limit ?? 40,
      page: aiQuery.page ?? 1,
    };
    // Add filters if provided (language, assortment, vocals)
    if (aiQuery.filters && aiQuery.filters.length > 0) {
      requestBody.filters = aiQuery.filters;
    }
    body = JSON.stringify(requestBody);
    url = `${aiServiceUrl}/smash/brandRecommend`;
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

// -----------------------------------------------------------------------------
// Owner Type Validation for Rail Items
// -----------------------------------------------------------------------------

interface ItemOwnerTypeInfo {
  itemCode: string;
  ownerType: string | null;
}

// Get owner types for track codes by looking up tracks -> albums -> owners
const getOwnerTypesForTrackCodes = async (
  trackCodes: string[],
): Promise<Map<string, string | null>> => {
  if (trackCodes.length === 0) return new Map();

  const result = new Map<string, string | null>();

  // Fetch tracks with their owner info
  const tracksMap = await findTracksLightweight(trackCodes);

  // Collect all owner IDs
  const allOwnerIds: string[] = [];
  for (const [, track] of tracksMap) {
    if (track.ownerId && Array.isArray(track.ownerId)) {
      allOwnerIds.push(...track.ownerId);
    }
  }
  const uniqueOwnerIds = [...new Set(allOwnerIds)];

  // Fetch owner types
  const ownerTypeMap = new Map<string, string>();
  if (uniqueOwnerIds.length > 0) {
    const owners = await OwnerModel.findAll({
      where: { id: { [Op.in]: uniqueOwnerIds } },
      attributes: ["id", "type"],
    });
    for (const owner of owners) {
      if (owner.type) ownerTypeMap.set(owner.id, owner.type);
    }
  }

  // Map track codes to owner types
  for (const [code, track] of tracksMap) {
    let ownerType: string | null = null;
    if (track.ownerId && Array.isArray(track.ownerId)) {
      for (const oid of track.ownerId) {
        const type = ownerTypeMap.get(oid);
        if (type) {
          ownerType = type;
          break;
        }
      }
    }
    result.set(code, ownerType);
  }

  return result;
};

// Get owner types for label codes (labels are owners)
const getOwnerTypesForLabelCodes = async (
  labelCodes: string[],
): Promise<Map<string, string | null>> => {
  if (labelCodes.length === 0) return new Map();

  const result = new Map<string, string | null>();

  const owners = await OwnerModel.findAll({
    where: { ownerCode: { [Op.in]: labelCodes } },
    attributes: ["ownerCode", "type"],
  });

  for (const owner of owners) {
    result.set(owner.ownerCode, owner.type ?? null);
  }

  // Set null for labels not found
  for (const code of labelCodes) {
    if (!result.has(code)) {
      result.set(code, null);
    }
  }

  return result;
};

// Validate that items are compatible with the target page
interface ItemValidationError {
  itemCode: string;
  itemType: string;
  ownerType: string;
  pageName: PageName;
  allowedTypes: OwnerType[];
}

const validateItemsForPage = async (
  items: { itemType: string; itemCode: string }[],
  pageName: PageName,
): Promise<ItemValidationError[]> => {
  const allowedTypes = getAllowedOwnerTypesForPage(pageName);

  // HOME allows all types
  if (allowedTypes === null) return [];

  const errors: ItemValidationError[] = [];

  // Separate items by type
  const trackCodes = items
    .filter((i) => i.itemType === RailItemType.TRACK)
    .map((i) => i.itemCode);
  const labelCodes = items
    .filter((i) => i.itemType === RailItemType.LABEL)
    .map((i) => i.itemCode);

  // Get owner types for tracks and labels
  const [trackOwnerTypes, labelOwnerTypes] = await Promise.all([
    getOwnerTypesForTrackCodes(trackCodes),
    getOwnerTypesForLabelCodes(labelCodes),
  ]);

  // Check tracks
  for (const code of trackCodes) {
    const ownerType = trackOwnerTypes.get(code);
    if (ownerType && !allowedTypes.includes(ownerType as OwnerType)) {
      errors.push({
        itemCode: code,
        itemType: RailItemType.TRACK,
        ownerType,
        pageName,
        allowedTypes,
      });
    }
  }

  // Check labels
  for (const code of labelCodes) {
    const ownerType = labelOwnerTypes.get(code);
    if (ownerType && !allowedTypes.includes(ownerType as OwnerType)) {
      errors.push({
        itemCode: code,
        itemType: RailItemType.LABEL,
        ownerType,
        pageName,
        allowedTypes,
      });
    }
  }

  return errors;
};

// Format validation errors into a readable message
const formatValidationErrors = (errors: ItemValidationError[]): string => {
  if (errors.length === 0) return "";

  const grouped = new Map<PageName, ItemValidationError[]>();
  for (const err of errors) {
    const list = grouped.get(err.pageName) || [];
    list.push(err);
    grouped.set(err.pageName, list);
  }

  const messages: string[] = [];
  for (const [pageName, errs] of grouped) {
    const allowedTypes = errs[0].allowedTypes.join(", ");
    const itemList = errs
      .map((e) => `${e.itemType}:${e.itemCode} (owner type: ${e.ownerType})`)
      .join(", ");
    messages.push(
      `Page ${pageName} only allows owner types [${allowedTypes}], but found incompatible items: ${itemList}`,
    );
  }

  return messages.join("; ");
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
  updatedById?: number | null,
): Promise<UpsertRailResult> => {
  const brandId = req.brandId ?? null;
  const pageNames = req.pageNames ?? [PageName.HOME];

  // Build items once (same items for all pages)
  const items = await buildItemsForUpsert(req);

  // Validate items against all target pages
  // Only TRACK and LABEL items need validation (other types have no owner restriction)
  const itemsToValidate = items.filter((i) => itemTypeHasOwnerRestriction(i.itemType));
  if (itemsToValidate.length > 0) {
    const allErrors: ItemValidationError[] = [];
    for (const pageName of pageNames) {
      const errors = await validateItemsForPage(itemsToValidate, pageName);
      allErrors.push(...errors);
    }
    if (allErrors.length > 0) {
      throw new Error(`Owner type validation failed: ${formatValidationErrors(allErrors)}`);
    }
  }

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
        updatedById: updatedById ?? null,
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
  updatedById?: number | null,
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

  // Validate new items (items without id) against the rail's page owner type restrictions
  // Only TRACK and LABEL items need validation
  if (itemTypeHasOwnerRestriction(itemType)) {
    const newItems = req.items
      .filter((i) => i.id == null) // Only validate new items
      .map((i) => ({ itemType, itemCode: i.itemCode }));

    if (newItems.length > 0) {
      const pageName = rail.pageName as PageName;
      const errors = await validateItemsForPage(newItems, pageName);
      if (errors.length > 0) {
        throw new Error(`Owner type validation failed: ${formatValidationErrors(errors)}`);
      }
    }
  }

  // Build items for update
  const itemsToUpdate: UpdateRailItemInput[] = req.items.map((item) => ({
    id: item.id,
    itemType,
    itemCode: item.itemCode,
    order: item.order,
    isLocked: item.isLocked ?? false,
  }));

  const updatedItems = await updateRailItems(railId, itemsToUpdate, updatedById);

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
  updatedById?: number | null,
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

  await bulkUpdateRailOrders(req.railOrders, req.pageName, brandIds[0], updatedById);
  return { updated: req.railOrders.length, pageName: req.pageName };
};

// -----------------------------------------------------------------------------
// Copy a rail to multiple target pages (with owner type validation)
// -----------------------------------------------------------------------------

export interface CopyRailRequest {
  railId: number;
  targetPageNames: PageName[];
  brandId?: number | null;
}

export const copyRailService = async (
  req: CopyRailRequest,
  updatedById?: number | null,
): Promise<CopyRailResult> => {
  // First, get the source rail with its items
  const sourceRail = await findRailById(req.railId);
  if (!sourceRail) {
    throw new Error(`Rail with ID ${req.railId} not found`);
  }

  const sourceItems = sourceRail.items || [];

  // Manual-only pages (e.g. APP_HOME) must stay hand-curated: refuse to copy a
  // QUERY / AI_QUERY rail onto them (the copied rail would re-execute its query).
  if (sourceRail.sourceType !== RailSourceType.MANUAL) {
    const manualOnlyTargets = req.targetPageNames.filter((p) => isManualOnlyPage(p));
    if (manualOnlyTargets.length > 0) {
      throw new Error(
        `Cannot copy rail: Pages [${manualOnlyTargets.join(", ")}] only allow MANUAL rails (no QUERY/AI_QUERY)`,
      );
    }
  }

  // Only validate TRACK and LABEL items
  const itemsToValidate = sourceItems
    .filter((item) => itemTypeHasOwnerRestriction(item.itemType))
    .map((item) => ({ itemType: item.itemType, itemCode: item.itemCode }));

  // Validate items against each target page
  if (itemsToValidate.length > 0) {
    const allErrors: ItemValidationError[] = [];
    for (const targetPageName of req.targetPageNames) {
      // Skip validation if target page is same as source (will be skipped anyway)
      if (targetPageName === sourceRail.pageName) continue;

      const errors = await validateItemsForPage(itemsToValidate, targetPageName);
      allErrors.push(...errors);
    }

    if (allErrors.length > 0) {
      throw new Error(
        `Cannot copy rail: Owner type validation failed. ${formatValidationErrors(allErrors)}`,
      );
    }
  }

  // All validations passed, proceed with copy
  return copyRailToPages(req.railId, req.targetPageNames, req.brandId, updatedById);
};

// -----------------------------------------------------------------------------
// Populate-mode toggle: MANUAL (CMS-curated rail_items only) <-> AUTO (app
// auto-fills from the catalogue; rail_items act as PIN/HIDE overrides). The
// app endpoint reads `populateMode`; flipping it hands control to/from the CMS.
// -----------------------------------------------------------------------------
export const setRailModeService = async (
  railId: number,
  populateMode: string,
  updatedById?: number | null,
): Promise<{ id: number; populateMode: string } | null> => {
  const updated = await updateRailMode(railId, populateMode, updatedById);
  if (!updated) return null;
  return { id: updated.id, populateMode: updated.populateMode ?? "MANUAL" };
};

// -----------------------------------------------------------------------------
// See-All endpoint: paginated full content of a single rail
// -----------------------------------------------------------------------------

const SEE_ALL_AI_QUERY_HARD_CAP = 200;

interface RailSourceConfigQuery {
  filterIds?: string[];
  ownerIds?: string[];
  excludeOwnerIds?: string[];
  excludeTiers?: string[];
  popular?: boolean;
  trending?: boolean;
  newOnHoopr?: boolean;
  movie?: boolean;
  type?: string[];
  ownerCode?: string[];
  campaign?: boolean;
  releaseYearFrom?: number;
  releaseYearTo?: number;
}

interface RailSourceConfigAiQuery {
  queryType?: 'TRENDING' | 'POPULAR' | 'FILTERED' | 'NEW_AGE_ICONS' | 'BRAND_RECOMMENDED';
  limit?: number;
  q?: string;
  brandName?: string;
  userId?: string;
  filters?: Array<{
    type: string;
    value: string[] | string;
  }>;
  url?: string;
  body?: Record<string, unknown>;
  headers?: Record<string, string>;
}

// Re-execute QUERY rail with pagination support
const resolveQueryTracksPaginated = async (
  query: RailSourceConfigQuery,
  page: number,
  limit: number,
  brandId?: number | null,
): Promise<{ codes: string[]; total: number }> => {
  const hasFilterIds = Array.isArray(query.filterIds) && query.filterIds.length > 0;
  const hasTrackFilters = query.popular || query.trending || query.newOnHoopr ||
    query.movie !== undefined || query.campaign || query.type || query.ownerCode ||
    query.releaseYearFrom || query.releaseYearTo;

  let excludeOwnerIds: string[] | undefined;
  if (brandId) {
    const [brandExcludeOwnerIds, tokenTypes, defaultRestrictedIds] = await Promise.all([
      getRestrictedOwnersByBrandId(brandId),
      getActiveBrandTokenTypes(brandId),
      UNAUTHENTICATED_RESTRICTED_OWNER_NAMES.length > 0
        ? getOwnerIdsByNames(UNAUTHENTICATED_RESTRICTED_OWNER_NAMES)
        : Promise.resolve([]),
    ]);
    const defaultRestricted = tokenTypes.has("Chartbusters") ? [] : defaultRestrictedIds;
    const combined = [...(brandExcludeOwnerIds || []), ...defaultRestricted];
    excludeOwnerIds = combined.length > 0 ? combined : undefined;
  } else if (UNAUTHENTICATED_RESTRICTED_OWNER_NAMES.length > 0) {
    const resolvedIds = await getOwnerIdsByNames(UNAUTHENTICATED_RESTRICTED_OWNER_NAMES);
    excludeOwnerIds = resolvedIds.length > 0 ? resolvedIds : undefined;
  }
  if (query.excludeOwnerIds && query.excludeOwnerIds.length > 0) {
    excludeOwnerIds = excludeOwnerIds
      ? [...new Set([...excludeOwnerIds, ...query.excludeOwnerIds])]
      : query.excludeOwnerIds;
  }

  if (hasFilterIds) {
    const result = await findTracksByFilter({
      filterIds: query.filterIds!,
      page,
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
    return { codes, total: result.count ?? codes.length };
  }

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
      const movieTrackIds = await findTrackIdsByAlbumType("movie");
      if (query.movie === true) {
        if (movieTrackIds.length === 0) return { codes: [], total: 0 };
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

    const [ownerIdsByType, ownerIdsByCode] = await Promise.all([
      resolveOwnerIdsByType(query.type),
      resolveOwnerIdsByOwnerCode(query.ownerCode),
    ]);
    const ownerIds = intersectOwnerIds(ownerIdsByType, ownerIdsByCode);
    if (ownerIds && ownerIds.length === 0) {
      return { codes: [], total: 0 };
    }

    const rawData = await findAllTracks(
      page,
      limit,
      whereClause,
      ownerIds,
      excludeOwnerIds,
      query.popular === true,
      query.campaign === true,
      query.excludeTiers,
    );

    return {
      codes: rawData.rows.map((track) => track.trackCode),
      total: (rawData as unknown as { count?: number }).count ?? rawData.rows.length,
    };
  }

  return { codes: [], total: 0 };
};

// Build hydrated, owner-type-filtered RailItemResponse[] for a list of (itemType, itemCode) pairs.
// Used by the see-all service after it has paginated raw codes.
const buildSeeAllItems = async (
  itemPairs: Array<{ itemType: RailItemType; itemCode: string; order: number }>,
  pageName: PageName | undefined,
  userId?: number,
  viewerBrandId?: number,
): Promise<RailItemResponse[]> => {
  const trackCodes: string[] = [];
  const filterCodes: string[] = [];
  const playlistCodes: string[] = [];
  const labelCodes: string[] = [];
  const artistCodes: string[] = [];
  for (const p of itemPairs) {
    if (p.itemType === RailItemType.TRACK) trackCodes.push(p.itemCode);
    else if (p.itemType === RailItemType.PLAYLIST) playlistCodes.push(p.itemCode);
    else if (p.itemType === RailItemType.LABEL) labelCodes.push(p.itemCode);
    else if (p.itemType === RailItemType.ARTIST) artistCodes.push(p.itemCode);
    else filterCodes.push(p.itemCode);
  }

  const [tracks, filters, playlists, labels, artists] = await Promise.all([
    hydrateTracks(trackCodes, userId, viewerBrandId),
    hydrateFilters(filterCodes),
    hydratePlaylists(playlistCodes),
    hydrateLabels(labelCodes),
    hydrateArtists(artistCodes),
  ]);
  const maps: HydrationMaps = { tracks, filters, playlists, labels, artists };

  let items: RailItemResponse[] = itemPairs
    .map((p) => {
      const dummy = {
        itemType: p.itemType,
        itemCode: p.itemCode,
        order: p.order,
      } as unknown as RailItemModel;
      return {
        itemType: p.itemType,
        itemCode: p.itemCode,
        order: p.order,
        data: resolveItem(dummy, maps),
      };
    })
    .filter((entry) => entry.data !== null);

  if (pageName) {
    items = filterItemsByPageOwnerType(items, pageName);
  }

  return items;
};

export const getRailSeeAllService = async (
  railId: number,
  page: number,
  limit: number,
  reExecute: boolean,
  userId?: number,
  viewerBrandId?: number,
): Promise<RailSeeAllResponse | null> => {
  const rail = await findRailByIdWithoutItems(railId);
  if (!rail) return null;

  const railHeader: RailSeeAllResponse["rail"] = {
    id: Number(rail.id),
    key: rail.key,
    title: rail.title,
    subtitle: rail.subtitle ?? null,
    type: rail.type,
    subType: rail.subType ?? null,
    sourceType: rail.sourceType,
    pageName: rail.pageName,
  };

  const pageNameForFilter = rail.pageName as PageName | undefined;

  // Helper to build the response envelope
  const envelope = (
    items: RailItemResponse[],
    total: number,
  ): RailSeeAllResponse => {
    const totalPages = limit > 0 ? Math.ceil(total / limit) : 0;
    return {
      rail: railHeader,
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasMore: page < totalPages,
      },
    };
  };

  // Path A: paginate snapshotted rail_items
  // Used for MANUAL always, and for QUERY/AI_QUERY when reExecute=false
  const paginateSnapshot = async (): Promise<RailSeeAllResponse> => {
    const { rows, count } = await findRailItemsPaginated(railId, page, limit);
    const pairs = rows.map((r) => ({
      itemType: r.itemType as RailItemType,
      itemCode: r.itemCode,
      order: r.order,
    }));
    const items = await buildSeeAllItems(
      pairs,
      pageNameForFilter,
      userId,
      viewerBrandId,
    );
    return envelope(items, count);
  };

  if (rail.sourceType === RailSourceType.MANUAL || !reExecute) {
    return paginateSnapshot();
  }

  // Path B: re-execute QUERY rail
  if (rail.sourceType === RailSourceType.QUERY) {
    const cfg = (rail.sourceConfig ?? {}) as { query?: RailSourceConfigQuery };
    if (!cfg.query) {
      return paginateSnapshot();
    }
    const { codes, total } = await resolveQueryTracksPaginated(
      cfg.query,
      page,
      limit,
      viewerBrandId ?? rail.brandId ?? null,
    );
    const pairs = codes.map((code, idx) => ({
      itemType: RailItemType.TRACK,
      itemCode: code,
      order: (page - 1) * limit + idx,
    }));
    const items = await buildSeeAllItems(
      pairs,
      pageNameForFilter,
      userId,
      viewerBrandId,
    );
    return envelope(items, total);
  }

  // Path C: re-execute AI_QUERY rail (hard-capped at SEE_ALL_AI_QUERY_HARD_CAP)
  if (rail.sourceType === RailSourceType.AI_QUERY) {
    const cfg = (rail.sourceConfig ?? {}) as { aiQuery?: RailSourceConfigAiQuery };
    const aiQuery = cfg.aiQuery;
    if (!aiQuery) {
      return paginateSnapshot();
    }

    let allCodes: string[] = [];
    if (aiQuery.queryType === 'TRENDING') {
      allCodes = await resolveChartTracks(
        ChartTrackSource.TRENDING,
        SEE_ALL_AI_QUERY_HARD_CAP,
        viewerBrandId ?? rail.brandId ?? null,
      );
    } else if (aiQuery.queryType === 'POPULAR') {
      allCodes = await resolveChartTracks(
        ChartTrackSource.POPULAR,
        SEE_ALL_AI_QUERY_HARD_CAP,
        viewerBrandId ?? rail.brandId ?? null,
      );
    } else {
      // For FILTERED / NEW_AGE_ICONS / BRAND_RECOMMENDED / legacy URL,
      // re-run the AI service once with the hard cap, then slice locally.
      const upsertReq: UpsertRailRequest = {
        key: rail.key,
        title: rail.title,
        type: rail.type as RailType,
        sourceType: rail.sourceType as RailSourceType,
        brandId: viewerBrandId ?? rail.brandId ?? null,
        aiQuery: {
          queryType: (aiQuery.queryType ?? 'FILTERED') as
            | 'TRENDING' | 'POPULAR' | 'FILTERED' | 'NEW_AGE_ICONS' | 'BRAND_RECOMMENDED',
          limit: SEE_ALL_AI_QUERY_HARD_CAP,
          q: aiQuery.q,
          brandName: aiQuery.brandName,
          userId: aiQuery.userId,
          filters: aiQuery.filters as UpsertRailRequest["aiQuery"] extends infer T
            ? T extends { filters?: infer F } ? F : never
            : never,
          url: aiQuery.url,
          body: aiQuery.body,
          headers: aiQuery.headers,
          page: 1,
        },
      };
      try {
        allCodes = await resolveAiQueryTracks(upsertReq);
      } catch (err) {
        console.error(`[SeeAll] AI re-execute failed for rail ${railId}:`, err);
        return paginateSnapshot();
      }
    }

    const total = Math.min(allCodes.length, SEE_ALL_AI_QUERY_HARD_CAP);
    const cappedCodes = allCodes.slice(0, total);
    const start = (page - 1) * limit;
    const slice = cappedCodes.slice(start, start + limit);

    const pairs = slice.map((code, idx) => ({
      itemType: RailItemType.TRACK,
      itemCode: code,
      order: start + idx,
    }));
    const items = await buildSeeAllItems(
      pairs,
      pageNameForFilter,
      userId,
      viewerBrandId,
    );
    return envelope(items, total);
  }

  return paginateSnapshot();
};
