import { Op } from "sequelize";
import { RailModel } from "../../persistence-service/rail/schemas/rail.schema";
import { RailSourceType, RailItemType } from "../../dto-service/modules.export";
import {
  upsertRailWithItems,
  UpsertRailInput,
  RailItemInput,
} from "../../persistence-service/rail/rail.persistence.service";
import { findAllTracks } from "../../persistence-service/track/track.persistence.service";
import { ChartTrackSource } from "../../persistence-service/track/schemas/chart-tracks.schema";
import { resolveChartTracks } from "../../business-service/rail/rail.service";
import { logger } from "../../helper-service/logger";

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

async function fetchNewOnHooprTracks(limit: number = 40): Promise<string[]> {
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
      // QUERY rail with newOnHoopr
      const config = rail.sourceConfig as {
        query?: { newOnHoopr?: boolean };
        limit?: number;
      } | null;
      const limit = config?.limit ?? 40;

      trackCodes = await fetchNewOnHooprTracks(limit);
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
