import { Op } from "sequelize";
import { RailModel } from "../../persistence-service/rail/schemas/rail.schema";
import { RailSourceType, RailItemType } from "../../dto-service/modules.export";
import {
  upsertRailWithItems,
  UpsertRailInput,
  RailItemInput,
} from "../../persistence-service/rail/rail.persistence.service";
import { findAllTracks } from "../../persistence-service/track/track.persistence.service";
import { logger } from "../../helper-service/logger";

const REFRESHABLE_AI_QUERY_TYPES = ["TRENDING", "POPULAR", "NEW_AGE_ICONS"];
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

async function fetchAiQueryTracks(
  queryType: string,
  limit: number = 40,
  brandId?: number
): Promise<string[]> {
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

  if (queryType === "TRENDING") {
    const params = new URLSearchParams({ limit: String(limit) });
    if (brandId) params.set("brandId", String(brandId));
    url = `${AI_SERVICE_URL}/smash/trendingSongs?${params.toString()}`;
  } else if (queryType === "POPULAR") {
    const params = new URLSearchParams({ limit: String(limit) });
    if (brandId) params.set("brandId", String(brandId));
    url = `${AI_SERVICE_URL}/smash/popularSongs?${params.toString()}`;
  } else if (queryType === "NEW_AGE_ICONS") {
    method = "POST";
    body = JSON.stringify({ limit, page: 1 });
    url = `${AI_SERVICE_URL}/smash/curatedArtistTracks`;
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

  return result.tracks.map((track) => track.trackCode);
}

async function fetchBrandRecommendationTracks(
  brandId: number,
  limit: number = 40
): Promise<string[]> {
  if (!AI_SERVICE_URL) {
    throw new Error("AI_SERVICE_URL not configured");
  }

  const res = await fetch(`${AI_SERVICE_URL}/smash/brandRecommend`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      brand_id: String(brandId),
      limit,
      page: 1,
    }),
  });

  if (!res.ok) {
    throw new Error(`Brand recommend API returned ${res.status}`);
  }

  const json = (await res.json()) as {
    data?: { tracks?: Array<{ trackCode?: string }> };
  };

  return (json?.data?.tracks ?? [])
    .map((t) => t?.trackCode)
    .filter((code): code is string => !!code);
}

async function findRailsToRefresh(): Promise<RailModel[]> {
  // Find AI_QUERY rails (TRENDING, POPULAR, NEW_AGE_ICONS)
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
    return queryType && REFRESHABLE_AI_QUERY_TYPES.includes(queryType);
  });

  // Find brand recommendation rails
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

  return [...filteredAiQueryRails, ...brandRecommendedRails, ...newOnHooprRails];
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
      // Brand recommendation rail
      const brandIdStr = rail.key.replace(BRAND_RECOMMENDED_KEY_PREFIX, "");
      const brandId = parseInt(brandIdStr, 10);

      if (isNaN(brandId)) {
        throw new Error(`Invalid brandId in key: ${rail.key}`);
      }

      trackCodes = await fetchBrandRecommendationTracks(brandId);
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
        aiQuery?: { queryType?: string; limit?: number };
      } | null;
      const queryType = config?.aiQuery?.queryType;
      const limit = config?.aiQuery?.limit ?? 40;

      if (!queryType) {
        throw new Error("Missing queryType in sourceConfig");
      }

      trackCodes = await fetchAiQueryTracks(
        queryType,
        limit,
        rail.brandId ?? undefined
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
