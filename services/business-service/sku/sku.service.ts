import { AppError } from "../../helper-service/AppError";
import {
  listTracksWithSku,
  findTrackCodesByFilter,
  filterExistingTrackCodes,
  upsertSkuForTrack,
  bulkUpsertSkus,
  getSkuFilterOptions,
  type SkuValues,
  type TrackSkuRow,
} from "../../persistence-service/sku/modules.export";

// ---------------------------------------------------------------------------
// Internal-admin SKU (track pricing) business layer. Thin orchestration over
// the persistence helpers — input is already validated by Joi at the route.
// ---------------------------------------------------------------------------

const MAX_LIMIT = 100;

export interface ListSkusInput {
  page: number;
  limit: number;
  search?: string;
  ownerId?: string;
  tier?: string;
  status?: string;
  hasSku?: boolean;
}

export interface ListSkusResult {
  tracks: TrackSkuRow[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

export const listSkusService = async (
  input: ListSkusInput,
): Promise<ListSkusResult> => {
  const page = Math.max(1, Math.floor(input.page));
  const limit = Math.min(MAX_LIMIT, Math.max(1, Math.floor(input.limit)));

  const { rows, count } = await listTracksWithSku({
    page,
    limit,
    search: input.search,
    ownerId: input.ownerId,
    tier: input.tier,
    status: input.status,
    hasSku: input.hasSku,
  });

  return {
    tracks: rows,
    pagination: {
      page,
      limit,
      total: count,
      pages: Math.max(1, Math.ceil(count / limit)),
    },
  };
};

export const getSkuFiltersService = async () => {
  return getSkuFilterOptions();
};

// Upsert one track's SKU. Returns the saved SKU and whether it was created.
export const upsertSkuService = async (
  trackCode: string,
  values: SkuValues,
) => {
  const existing = await filterExistingTrackCodes([trackCode]);
  if (existing.length === 0) {
    throw new AppError(`Track ${trackCode} not found or not active.`, 404);
  }

  const { sku, created } = await upsertSkuForTrack(trackCode, values);
  return {
    created,
    sku: {
      id: sku.id,
      trackCode: sku.trackCode,
      itemType: sku.itemType,
      costPrice: sku.costPrice ?? null,
      sellingPrice: sku.sellingPrice ?? null,
      gstPercent: sku.gstPercent ?? null,
      maxUsage: sku.maxUsage ?? null,
      description: sku.description ?? null,
    },
  };
};

export interface BulkUpsertInput {
  // Exactly one of trackCodes / filter is supplied (enforced by validation).
  trackCodes?: string[];
  filter?: {
    ownerId?: string;
    tier?: string;
    status?: string;
    search?: string;
    onlyMissingSku?: boolean;
  };
  values: SkuValues;
}

export const bulkUpsertSkusService = async (input: BulkUpsertInput) => {
  let trackCodes: string[];

  if (input.trackCodes && input.trackCodes.length > 0) {
    // Explicit selection — keep only codes that map to a real active track.
    trackCodes = await filterExistingTrackCodes(input.trackCodes);
  } else if (input.filter) {
    // Filter-driven — resolve the full matching set server-side so the bulk
    // applies beyond the current page.
    trackCodes = await findTrackCodesByFilter(input.filter);
  } else {
    throw new AppError("Provide either trackCodes or a filter.", 400);
  }

  if (trackCodes.length === 0) {
    return { matched: 0, created: 0, updated: 0 };
  }

  return bulkUpsertSkus(trackCodes, input.values);
};
