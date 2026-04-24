import { RailModel } from "../../persistence-service/rail/schemas/rail.schema";
import { RailSourceType, RailItemType, RailType, PageName } from "../../dto-service/modules.export";
import {
  upsertRailWithItems,
  UpsertRailInput,
  RailItemInput,
} from "../../persistence-service/rail/rail.persistence.service";
import { getAllBrandIds } from "../../persistence-service/brand/brand.persistence.service";
import { logger } from "../../helper-service/logger";
import { BrandRecommendJobData } from "../queues/brand-recommend.queue";

const AI_SERVICE_URL = process.env.AI_SERVICE_URL;
const BRAND_RECOMMENDED_AI_KEY_PREFIX = "brand_recommended_ai_";
const RATE_LIMIT_DELAY_MS = 5000; // 5 seconds between each brand

interface BrandRecommendResult {
  brandId: number;
  success: boolean;
  itemCount?: number;
  error?: string;
}

export interface BrandRecommendSummary {
  startTime: Date;
  endTime: Date;
  totalBrands: number;
  successful: number;
  failed: number;
  results: BrandRecommendResult[];
}

async function fetchBrandRecommendTracks(
  brandId: number,
  filters?: BrandRecommendJobData["filters"],
  limit: number = 40
): Promise<string[]> {
  if (!AI_SERVICE_URL) {
    throw new Error("AI_SERVICE_URL not configured");
  }

  const requestBody: Record<string, unknown> = {
    brand_id: String(brandId),
    limit,
    page: 1,
  };

  if (filters && filters.length > 0) {
    requestBody.filters = filters;
  }

  const res = await fetch(`${AI_SERVICE_URL}/smash/brandRecommend`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(requestBody),
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

async function createBrandRecommendRail(
  brandId: number,
  trackCodes: string[],
  filters?: BrandRecommendJobData["filters"],
  customRailKey?: string,
  pageName: string = "HOME"
): Promise<void> {
  const filterSuffix = filters && filters.length > 0
    ? `_${filters.map(f => `${f.type}`).join("_")}`
    : "";
  const railKey = customRailKey || `${BRAND_RECOMMENDED_AI_KEY_PREFIX}${brandId}_${pageName}${filterSuffix}`;
  const pageNameEnum = pageName as PageName;

  const items: RailItemInput[] = trackCodes.map((trackCode, idx) => ({
    itemType: RailItemType.TRACK,
    itemCode: trackCode,
    order: idx,
  }));

  // Find existing rail order or use a high number for placement
  const existingRail = await RailModel.findOne({
    where: { key: railKey, brandId, pageName: pageNameEnum },
  });

  const input: UpsertRailInput = {
    key: railKey,
    title: "Recommended For You",
    subtitle: null,
    type: RailType.TRACKS,
    subType: null,
    brandId,
    pageName: pageNameEnum,
    sourceType: RailSourceType.AI_QUERY,
    sourceConfig: {
      aiQuery: {
        queryType: "BRAND_RECOMMENDED",
        filters: filters || [],
        limit: trackCodes.length,
      },
      createdAt: new Date().toISOString(),
    },
    order: existingRail?.order ?? 0,
    isVisible: true,
  };

  await upsertRailWithItems(input, items);
}

async function processSingleBrand(
  brandId: number,
  filters?: BrandRecommendJobData["filters"],
  limit?: number,
  customRailKey?: string,
  pageName?: string
): Promise<BrandRecommendResult> {
  const result: BrandRecommendResult = {
    brandId,
    success: false,
  };

  try {
    const trackCodes = await fetchBrandRecommendTracks(brandId, filters, limit);

    if (trackCodes.length === 0) {
      logger.warn(`[BrandRecommend] No tracks returned for brand ${brandId}`);
      result.success = true;
      result.itemCount = 0;
      return result;
    }

    await createBrandRecommendRail(brandId, trackCodes, filters, customRailKey, pageName);

    result.success = true;
    result.itemCount = trackCodes.length;
    logger.info(
      `[BrandRecommend] Created rail for brand ${brandId} with ${trackCodes.length} items`
    );
  } catch (error) {
    result.error = (error as Error).message;
    logger.error(`[BrandRecommend] Failed for brand ${brandId}:`, error);
  }

  return result;
}

export async function executeBrandRecommend(
  data: BrandRecommendJobData
): Promise<BrandRecommendSummary> {
  const startTime = new Date();
  logger.info(
    `[BrandRecommend] Starting job at ${startTime.toISOString()}`,
    { brandId: data.brandId, filters: data.filters }
  );

  const results: BrandRecommendResult[] = [];

  if (data.brandId) {
    // Process single brand immediately
    const result = await processSingleBrand(
      data.brandId,
      data.filters,
      data.limit,
      data.railKey,
      data.pageName
    );
    results.push(result);
  } else {
    // Process all brands with rate limiting (1 per 5 seconds)
    const brandIds = await getAllBrandIds();
    logger.info(`[BrandRecommend] Processing ${brandIds.length} brands with ${RATE_LIMIT_DELAY_MS}ms delay`);

    for (let i = 0; i < brandIds.length; i++) {
      const brandId = brandIds[i];
      const result = await processSingleBrand(
        brandId,
        data.filters,
        data.limit,
        undefined, // No custom rail key for bulk processing
        data.pageName
      );
      results.push(result);

      // Rate limiting: wait 5 seconds before processing next brand
      if (i < brandIds.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, RATE_LIMIT_DELAY_MS));
      }
    }
  }

  const endTime = new Date();
  const successful = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;

  const summary: BrandRecommendSummary = {
    startTime,
    endTime,
    totalBrands: results.length,
    successful,
    failed,
    results,
  };

  logger.info(
    `[BrandRecommend] Job completed. Total: ${results.length}, Success: ${successful}, Failed: ${failed}, Duration: ${endTime.getTime() - startTime.getTime()}ms`
  );

  return summary;
}
