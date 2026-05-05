import { Op, fn, col, where } from "sequelize";
import { RailModel } from "../../persistence-service/rail/schemas/rail.schema";
import { RailSourceType, RailItemType } from "../../dto-service/modules.export";
import {
  upsertRailWithItems,
  UpsertRailInput,
  RailItemInput,
} from "../../persistence-service/rail/rail.persistence.service";
import { findAllTracks, findTracksByFilter } from "../../persistence-service/track/track.persistence.service";
import { ChartTrackSource } from "../../persistence-service/track/schemas/chart-tracks.schema";
import { resolveChartTracks } from "../../business-service/rail/rail.service";
import { logger } from "../../helper-service/logger";
import { OwnerModel } from "../../persistence-service/owner/modules.export";
import { findTrackIdsByAlbumType } from "../../persistence-service/albums/albums.persistence.service";

const REFRESHABLE_AI_QUERY_TYPES = ["TRENDING", "POPULAR", "NEW_AGE_ICONS", "BRAND_RECOMMENDED"];
const BRAND_RECOMMENDED_KEY_PREFIX = "brand_recommended_";
const AI_SERVICE_URL = process.env.AI_SERVICE_URL;

interface RefreshResult {
  railId: number;
  railKey: string;
  success: boolean;
  itemCount?: number;
  error?: string;
}

export interface RefreshSummary {
  startTime: Date;
  endTime: Date;
  totalRails: number;
  successful: number;
  failed: number;
  results: RefreshResult[];
}

interface AiQueryFilter {
  type: string;
  value: string[] | string;
}

async function fetchAiQueryTracks(
  queryType: string,
  limit: number = 40,
  brandId?: number,
  filters?: AiQueryFilter[]
): Promise<string[]> {
  // TRENDING/POPULAR are sourced from the chart_tracks table — no AI service needed.
  if (queryType === "TRENDING") {
    return resolveChartTracks(ChartTrackSource.TRENDING, limit, brandId);
  }
  if (queryType === "POPULAR") {
    return resolveChartTracks(ChartTrackSource.POPULAR, limit, brandId);
  }

  if (!AI_SERVICE_URL) {
    throw new Error("AI_SERVICE_URL not configured");
  }

  let url: string;
  let method: string = "GET";
  let body: string | undefined;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };

  if (queryType === "NEW_AGE_ICONS") {
    method = "POST";
    body = JSON.stringify({ limit, page: 1 });
    url = `${AI_SERVICE_URL}/smash/curatedArtistTracks`;
  } else if (queryType === "BRAND_RECOMMENDED") {
    if (!brandId) {
      throw new Error("brandId is required for BRAND_RECOMMENDED query type");
    }
    method = "POST";
    const requestBody: Record<string, unknown> = {
      brand_id: String(brandId),
      limit,
      page: 1,
    };
    if (filters && filters.length > 0) {
      requestBody.filters = filters;
    }
    body = JSON.stringify(requestBody);
    url = `${AI_SERVICE_URL}/smash/brandRecommend`;
  } else {
    throw new Error(`Unsupported AI query type: ${queryType}`);
  }

  const res = await fetch(url, { method, headers, body });
  if (!res.ok) {
    throw new Error(`AI service returned ${res.status}`);
  }

  const json = (await res.json()) as {
    data?: { tracks?: Array<{ trackCode?: string }> };
  };

  return (json?.data?.tracks ?? [])
    .map((t) => t?.trackCode)
    .filter((code): code is string => !!code);
}

// Query filter interface matching rail.service.ts structure
interface QueryConfig {
  filterIds?: string[];
  ownerIds?: string[];
  excludeOwnerIds?: string[];
  excludeTiers?: string[];
  popular?: boolean;
  trending?: boolean;
  newOnHoopr?: boolean;
  movie?: boolean;
  type?: string[];       // owner type filter (e.g., ["Chartbusters"])
  ownerCode?: string[];  // owner code filter
  campaign?: boolean;
  releaseYearFrom?: number;
  releaseYearTo?: number;
}

// Resolve owner IDs from type filter
async function resolveOwnerIdsByType(
  types?: string[],
): Promise<string[] | undefined> {
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
}

// Resolve owner IDs from ownerCode filter
async function resolveOwnerIdsByOwnerCode(
  ownerCodes?: string[],
): Promise<string[] | undefined> {
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
}

// Intersect two owner ID arrays
function intersectOwnerIds(
  a: string[] | undefined,
  b: string[] | undefined,
): string[] | undefined {
  if (!a && !b) return undefined;
  if (!a) return b;
  if (!b) return a;
  const setB = new Set(b);
  return a.filter((id) => setB.has(id));
}

// Fetch tracks based on query config with all filters applied
async function fetchQueryTracks(query: QueryConfig, limit: number = 40): Promise<string[]> {
  const hasFilterIds = Array.isArray(query.filterIds) && query.filterIds.length > 0;
  const hasTrackFilters = query.popular || query.trending || query.newOnHoopr ||
    query.movie !== undefined || query.campaign || query.type || query.ownerCode ||
    query.releaseYearFrom || query.releaseYearTo;

  // If filterIds are provided, use findTracksByFilter
  if (hasFilterIds) {
    const result = await findTracksByFilter({
      filterIds: query.filterIds!,
      page: 1,
      limit,
      ownerIds: query.ownerIds,
      excludeOwnerIds: query.excludeOwnerIds,
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

    if (query.trending == true) {
      whereClause.trending = true;
    }

    if (query.popular == true) {
      whereClause[Op.or as any] = [
        { jioSaavanStream: { [Op.gt]: "0" } },
        { jioSaavanStream: null },
      ];

      // Filter by album type based on movie parameter
      const movieTrackIds = await findTrackIdsByAlbumType("movie");
      if (query.movie == true) {
        if (movieTrackIds.length === 0) return [];
        whereClause.id = { [Op.in]: movieTrackIds };
      } else if (query.movie === false) {
        if (movieTrackIds.length > 0) {
          whereClause.id = { [Op.notIn]: movieTrackIds };
        }
      }
    }

    if (query.newOnHoopr == true) {
      const oneWeekAgo = new Date();
      oneWeekAgo.setDate(oneWeekAgo.getDate() - 100);
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
    const [ownerIdsByType] = await Promise.all([
      resolveOwnerIdsByType(query.type),
    ]);
    const ownerIds = ownerIdsByType; // If we had multiple owner ID sources, we would intersect them here

    // If type or ownerCode filters were specified but no matching owners found, return empty
    if (ownerIds && ownerIds.length === 0) {
      return [];
    }

    console.log("whereClause", whereClause, "=============", query.newOnHoopr);
    
    const rawData = await findAllTracks(
      1,
      limit,
      whereClause,
      ownerIds,
      query.excludeOwnerIds,
      query.popular == true,
      query.campaign == true,
      query.excludeTiers,
    );

    return rawData.rows.map((track) => track.trackCode);
  }

  // Fallback: just newOnHoopr without other filters
  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

  const result = await findAllTracks(
    1,
    limit,
    { createdAt: { [Op.gte]: oneWeekAgo } },
    undefined,
    undefined,
    false,
    false,
    undefined
  );

  return result.rows.map((track) => track.trackCode);
}

async function findRailsToRefresh(): Promise<RailModel[]> {
  // Find AI_QUERY rails (TRENDING, POPULAR, NEW_AGE_ICONS) - excluding BRAND_RECOMMENDED which we handle separately
  const aiQueryRails = await RailModel.findAll({
    where: {
      sourceType: RailSourceType.AI_QUERY,
      isVisible: true,
    },
  });

  const filteredAiQueryRails = aiQueryRails.filter((rail) => {
    const config = rail.sourceConfig as {
      aiQuery?: { queryType?: string };
    } | null;
    const queryType = config?.aiQuery?.queryType;
    // Exclude BRAND_RECOMMENDED - we find those by key prefix to catch both old and new format
    return queryType && REFRESHABLE_AI_QUERY_TYPES.includes(queryType) && queryType !== "BRAND_RECOMMENDED";
  });

  // Find brand recommendation rails by key prefix (catches both old format "brand_recommended_13"
  // and new format "brand_recommended_ai_13_HOME")
  const brandRecommendedRails = await RailModel.findAll({
    where: {
      key: { [Op.like]: `${BRAND_RECOMMENDED_KEY_PREFIX}%` },
      isVisible: true,
    },
  });

  // Find QUERY rails with newOnHoopr: true
  const queryRails = await RailModel.findAll({
    where: {
      sourceType: RailSourceType.QUERY,
      isVisible: true,
    },
  });

  const newOnHooprRails = queryRails.filter((rail) => {
    const config = rail.sourceConfig as {
      query?: { newOnHoopr?: boolean };
    } | null;
    return config?.query?.newOnHoopr === true;
  });

  // Deduplicate rails by ID first
  const allRails = [...filteredAiQueryRails, ...brandRecommendedRails, ...newOnHooprRails];
  const uniqueById = Array.from(new Map(allRails.map(r => [r.id, r])).values());

  // Also deduplicate by (key, brandId, pageName) - keep the one with higher ID (newer)
  // This handles cases where duplicate rails exist with same unique constraint fields
  const uniqueByConstraint = new Map<string, RailModel>();
  for (const rail of uniqueById) {
    const constraintKey = `${rail.key}:${rail.brandId ?? 'null'}:${rail.pageName}`;
    const existing = uniqueByConstraint.get(constraintKey);
    if (!existing || rail.id > existing.id) {
      uniqueByConstraint.set(constraintKey, rail);
    }
  }

  return Array.from(uniqueByConstraint.values());
}

async function refreshRail(rail: RailModel): Promise<RefreshResult> {
  const result: RefreshResult = {
    railId: rail.id,
    railKey: rail.key,
    success: false,
  };

  try {
    let trackCodes: string[];

    if (rail.key.startsWith(BRAND_RECOMMENDED_KEY_PREFIX)) {
      // Brand recommendation rail - use brandId from the rail itself, not from the key
      const brandId = rail.brandId;

      if (!brandId) {
        throw new Error(`Missing brandId for brand_recommended rail: ${rail.key}`);
      }

      // Extract filters from sourceConfig if available
      const config = rail.sourceConfig as {
        filters?: AiQueryFilter[];
        aiQuery?: { filters?: AiQueryFilter[] };
      } | null;
      const filters = config?.filters || config?.aiQuery?.filters;

      trackCodes = await fetchAiQueryTracks("BRAND_RECOMMENDED", 40, brandId, filters);
    } else if (rail.sourceType === RailSourceType.QUERY) {
      // QUERY rail - apply all query filters from sourceConfig
      const config = rail.sourceConfig as {
        query?: QueryConfig;
        limit?: number;
      } | null;

      if (config?.query?.newOnHoopr == true) {
        const limit = config?.limit ?? 40;
        logger.info(`[RailRefresh] Refreshing QUERY rail ${rail.key} with filters: ${JSON.stringify(config.query)}`);
        trackCodes = await fetchQueryTracks(config.query, limit);
      } else {
        logger.warn(`[RailRefresh] QUERY rail ${rail.key} has no query config, skipping`);
        result.success = true;
        result.itemCount = 0;
        return result;
      }
    } else {
      // AI_QUERY rail
      const config = rail.sourceConfig as {
        aiQuery?: { queryType?: string; limit?: number; filters?: AiQueryFilter[] };
      } | null;
      const queryType = config?.aiQuery?.queryType;
      const limit = config?.aiQuery?.limit ?? 40;
      const filters = config?.aiQuery?.filters;

      if (!queryType) {
        throw new Error("Missing queryType in sourceConfig");
      }

      trackCodes = await fetchAiQueryTracks(
        queryType,
        limit,
        rail.brandId ?? undefined,
        filters
      );
    }

    if (trackCodes.length === 0) {
      logger.warn(`[RailRefresh] No tracks returned for rail ${rail.key}`);
      result.success = true;
      result.itemCount = 0;
      return result;
    }

    const items: RailItemInput[] = trackCodes.map((trackCode, idx) => ({
      itemType: RailItemType.TRACK,
      itemCode: trackCode,
      order: idx,
    }));

    const input: UpsertRailInput = {
      key: rail.key,
      title: rail.title,
      subtitle: rail.subtitle ?? null,
      type: rail.type,
      subType: rail.subType ?? null,
      brandId: rail.brandId ?? null,
      pageName: rail.pageName,
      sourceType: rail.sourceType,
      sourceConfig: rail.sourceConfig ?? null,
      order: rail.order,
      isVisible: rail.isVisible,
    };

    await upsertRailWithItems(input, items);

    result.success = true;
    result.itemCount = trackCodes.length;
    logger.info(
      `[RailRefresh] Refreshed rail ${rail.key} with ${trackCodes.length} items`
    );
  } catch (error) {
    result.error = (error as Error).message;
    logger.error(`[RailRefresh] Failed to refresh rail ${rail.key}:`, error);
  }

  return result;
}

export async function executeRailRefresh(): Promise<RefreshSummary> {
  const startTime = new Date();
  logger.info(
    `[RailRefresh] Starting rail refresh job at ${startTime.toISOString()}`
  );

  const rails = await findRailsToRefresh();
  logger.info(`[RailRefresh] Found ${rails.length} rails to refresh`);

  const results: RefreshResult[] = [];

  for (const rail of rails) {
    const result = await refreshRail(rail);
    results.push(result);
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  const endTime = new Date();
  const successful = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;

  const summary: RefreshSummary = {
    startTime,
    endTime,
    totalRails: rails.length,
    successful,
    failed,
    results,
  };

  logger.info(
    `[RailRefresh] Job completed. Total: ${rails.length}, Success: ${successful}, Failed: ${failed}, Duration: ${endTime.getTime() - startTime.getTime()}ms`
  );

  return summary;
}
