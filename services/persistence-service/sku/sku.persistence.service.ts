import { Op, Sequelize } from "sequelize";
import { SkuModel, ItemType } from "./schemas/sku.schema";
import { TrackModel } from "../track/schemas/track.schema";
import { OwnerModel } from "../owner/schemas/owner.schema";

// ---------------------------------------------------------------------------
// Internal-admin SKU (track pricing) persistence layer.
//
// One TRACK-type SKU per track is the working model for the internal pricing
// dashboard. These helpers power the list/filter view, single-track upsert and
// bulk upsert (apply price to many tracks at once, by explicit codes or by an
// ownerId + tier filter). All writes upsert: an absent SKU is created, an
// existing one is updated.
// ---------------------------------------------------------------------------

// Matches the 20-char alphanumeric IDs used by existing SKUs (see
// scripts/seed-sku-prices.ts). SKU.id is a plain STRING primary key, not a UUID.
const SKU_ID_CHARS =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const generateSkuId = (length = 20): string => {
  let id = "";
  for (let i = 0; i < length; i++) {
    id += SKU_ID_CHARS[Math.floor(Math.random() * SKU_ID_CHARS.length)];
  }
  return id;
};

export interface SkuValues {
  costPrice?: number | null;
  sellingPrice?: number | null;
  gstPercent?: number | null;
  maxUsage?: number | null;
  description?: string | null;
}

export interface TrackSkuRow {
  trackId: string;
  trackCode: string;
  name: string | null;
  tier: string | null;
  status: string | null;
  ownerIds: string[];
  owners: { id: string; name: string; type: string | null }[];
  sku: {
    id: string;
    itemType: string;
    costPrice: number | null;
    sellingPrice: number | null;
    gstPercent: number | null;
    maxUsage: number | null;
    description: string | null;
    updatedAt: Date | null;
  } | null;
}

export interface ListTracksWithSkuParams {
  page: number;
  limit: number;
  search?: string;
  ownerId?: string;
  tier?: string;
  // 'true' → only tracks that already have a SKU, 'false' → only tracks missing one
  hasSku?: boolean;
}

// Build the shared track WHERE clause from the filter inputs.
const buildTrackWhere = (params: {
  search?: string;
  ownerId?: string;
  tier?: string;
}): Record<string | symbol, unknown> => {
  const where: Record<string | symbol, unknown> = { status: "ACTIVE" };
  const and: unknown[] = [];

  if (params.ownerId) {
    and.push({ ownerId: { [Op.overlap]: [params.ownerId] } });
  }

  if (params.tier) {
    and.push({ tier: params.tier });
  }

  if (params.search && params.search.trim().length > 0) {
    const term = params.search.trim().replace(/[%_\\]/g, "\\$&");
    and.push({
      [Op.or]: [
        { name: { [Op.iLike]: `%${term}%` } },
        { trackCode: { [Op.iLike]: `%${term}%` } },
      ],
    });
  }

  if (and.length) where[Op.and] = and;
  return where;
};

// Attach owner display info (id, username, type) to a set of ownerId arrays.
const buildOwnerMap = async (
  ownerIds: string[],
): Promise<Map<string, { id: string; name: string; type: string | null }>> => {
  const map = new Map<string, { id: string; name: string; type: string | null }>();
  const unique = [...new Set(ownerIds.filter(Boolean))];
  if (unique.length === 0) return map;

  const owners = await OwnerModel.findAll({
    where: { id: { [Op.in]: unique } },
    attributes: ["id", "username", "type"],
  });
  owners.forEach((o) => {
    map.set(o.id, { id: o.id, name: o.username || "", type: o.type || null });
  });
  return map;
};

const pickTrackSku = (skus: SkuModel[] | undefined): SkuModel | null => {
  if (!skus || skus.length === 0) return null;
  // Prefer the TRACK-type SKU; fall back to the first row if none is tagged.
  return skus.find((s) => s.itemType === ItemType.TRACK) ?? skus[0];
};

export const listTracksWithSku = async (
  params: ListTracksWithSkuParams,
): Promise<{ rows: TrackSkuRow[]; count: number }> => {
  const offset = (params.page - 1) * params.limit;
  const where = buildTrackWhere(params);

  // hasSku is a constraint on the SKU association: required=true keeps only
  // tracks that have a SKU; for "missing" we post-filter after a left join
  // because Sequelize can't express "association is null" in WHERE cleanly here.
  const skuInclude = {
    model: SkuModel,
    as: "skus",
    required: params.hasSku === true,
    attributes: [
      "id",
      "itemType",
      "costPrice",
      "sellingPrice",
      "gstPercent",
      "maxUsage",
      "description",
      "updatedAt",
    ],
  };

  const { count, rows } = await TrackModel.findAndCountAll({
    where,
    attributes: ["id", "trackCode", "name", "tier", "status", "ownerId"],
    include: [skuInclude],
    order: [["createdAt", "DESC"]],
    limit: params.limit,
    offset,
    distinct: true,
    col: "id",
    subQuery: false,
  });

  const json = rows.map((r) => r.toJSON() as {
    id: string;
    trackCode: string;
    name: string | null;
    tier: string | null;
    status: string | null;
    ownerId: string[] | null;
    skus?: SkuModel[];
  });

  // Resolve owner display names in one batched query.
  const allOwnerIds = json.flatMap((t) => t.ownerId ?? []);
  const ownerMap = await buildOwnerMap(allOwnerIds);

  let mapped: TrackSkuRow[] = json.map((t) => {
    const sku = pickTrackSku(t.skus);
    const ownerIds = t.ownerId ?? [];
    return {
      trackId: t.id,
      trackCode: t.trackCode,
      name: t.name ?? null,
      tier: t.tier ?? null,
      status: t.status ?? null,
      ownerIds,
      owners: ownerIds
        .map((id) => ownerMap.get(id))
        .filter((o): o is { id: string; name: string; type: string | null } => Boolean(o)),
      sku: sku
        ? {
            id: sku.id,
            itemType: sku.itemType,
            costPrice: sku.costPrice ?? null,
            sellingPrice: sku.sellingPrice ?? null,
            gstPercent: sku.gstPercent ?? null,
            maxUsage: sku.maxUsage ?? null,
            description: sku.description ?? null,
            updatedAt: sku.updatedAt ?? null,
          }
        : null,
    };
  });

  // "missing SKU" filter is applied in-memory after the left join.
  if (params.hasSku === false) {
    mapped = mapped.filter((r) => r.sku === null);
  }

  return { rows: mapped, count };
};

// All trackCodes matching a filter — used by bulk upsert so it can target the
// whole matching set, not just the current page. Optionally restricted to
// tracks that are missing a SKU.
export const findTrackCodesByFilter = async (params: {
  search?: string;
  ownerId?: string;
  tier?: string;
  onlyMissingSku?: boolean;
}): Promise<string[]> => {
  const where = buildTrackWhere(params);

  const include = params.onlyMissingSku
    ? [
        {
          model: SkuModel,
          as: "skus",
          required: false,
          attributes: ["id"],
        },
      ]
    : [];

  const rows = await TrackModel.findAll({
    where,
    attributes: ["trackCode"],
    include,
  });

  if (params.onlyMissingSku) {
    return rows
      .map((r) => r.toJSON() as { trackCode: string; skus?: { id: string }[] })
      .filter((r) => !r.skus || r.skus.length === 0)
      .map((r) => r.trackCode);
  }

  return rows.map((r) => r.trackCode);
};

// Validate that every supplied trackCode is a real, ACTIVE track. Returns the
// subset that exists so the caller can report unknown codes.
export const filterExistingTrackCodes = async (
  trackCodes: string[],
): Promise<string[]> => {
  if (trackCodes.length === 0) return [];
  const rows = await TrackModel.findAll({
    where: { trackCode: { [Op.in]: trackCodes }, status: "ACTIVE" },
    attributes: ["trackCode"],
    raw: true,
  });
  return rows.map((r) => (r as unknown as { trackCode: string }).trackCode);
};

// Only copy fields that were actually provided (undefined = leave unchanged).
const applyValues = (target: Partial<SkuModel>, values: SkuValues): void => {
  if (values.costPrice !== undefined) target.costPrice = values.costPrice ?? undefined;
  if (values.sellingPrice !== undefined)
    target.sellingPrice = values.sellingPrice ?? undefined;
  if (values.gstPercent !== undefined)
    target.gstPercent = values.gstPercent ?? undefined;
  if (values.maxUsage !== undefined && values.maxUsage !== null)
    target.maxUsage = values.maxUsage;
  if (values.description !== undefined)
    target.description = values.description ?? undefined;
};

export interface UpsertResult {
  sku: SkuModel;
  created: boolean;
}

// Upsert the SKU for a single track. Creates a TRACK SKU if none exists.
export const upsertSkuForTrack = async (
  trackCode: string,
  values: SkuValues,
): Promise<UpsertResult> => {
  const existing = await SkuModel.findOne({
    where: { trackCode, itemType: ItemType.TRACK },
  });

  if (existing) {
    applyValues(existing, values);
    await existing.save();
    return { sku: existing, created: false };
  }

  const created = await SkuModel.create({
    id: generateSkuId(),
    trackCode,
    itemType: ItemType.TRACK,
    costPrice: values.costPrice ?? undefined,
    sellingPrice: values.sellingPrice ?? undefined,
    // Defaults match the column defaults / seed script when not supplied.
    gstPercent: values.gstPercent ?? 18,
    maxUsage: values.maxUsage ?? 3,
    description: values.description ?? undefined,
  } as Partial<SkuModel> as SkuModel);

  return { sku: created, created: true };
};

export interface BulkUpsertResult {
  matched: number;
  created: number;
  updated: number;
}

// Bulk upsert across many trackCodes. Existing SKUs are updated in place;
// missing ones are bulk-created. Runs inside a transaction so a partial failure
// rolls back cleanly.
export const bulkUpsertSkus = async (
  trackCodes: string[],
  values: SkuValues,
): Promise<BulkUpsertResult> => {
  if (trackCodes.length === 0) return { matched: 0, created: 0, updated: 0 };

  const sequelize = SkuModel.sequelize as Sequelize;
  return sequelize.transaction(async (transaction) => {
    const existingMap = await (async () => {
      const map = new Map<string, SkuModel>();
      const skus = await SkuModel.findAll({
        where: { trackCode: { [Op.in]: trackCodes }, itemType: ItemType.TRACK },
        transaction,
      });
      for (const sku of skus) {
        if (!map.has(sku.trackCode)) map.set(sku.trackCode, sku);
      }
      return map;
    })();

    let updated = 0;
    const toCreate: Partial<SkuModel>[] = [];

    for (const trackCode of trackCodes) {
      const existing = existingMap.get(trackCode);
      if (existing) {
        applyValues(existing, values);
        await existing.save({ transaction });
        updated += 1;
      } else {
        toCreate.push({
          id: generateSkuId(),
          trackCode,
          itemType: ItemType.TRACK,
          costPrice: values.costPrice ?? undefined,
          sellingPrice: values.sellingPrice ?? undefined,
          gstPercent: values.gstPercent ?? 18,
          maxUsage: values.maxUsage ?? 3,
          description: values.description ?? undefined,
        });
      }
    }

    if (toCreate.length > 0) {
      await SkuModel.bulkCreate(toCreate as SkuModel[], { transaction });
    }

    return {
      matched: trackCodes.length,
      created: toCreate.length,
      updated,
    };
  }) as Promise<BulkUpsertResult>;
};

// Filter dropdown data: owners that actually own at least one active track, plus
// the distinct set of tiers in use.
export const getSkuFilterOptions = async (): Promise<{
  owners: { id: string; name: string; type: string | null }[];
  tiers: string[];
}> => {
  // Distinct tiers across active tracks.
  const tierRows = (await TrackModel.findAll({
    where: { status: "ACTIVE", tier: { [Op.ne]: null as unknown as string } },
    attributes: [[Sequelize.fn("DISTINCT", Sequelize.col("tier")), "tier"]],
    order: [["tier", "ASC"]],
    raw: true,
  })) as unknown as { tier: string }[];
  const tiers = tierRows.map((r) => r.tier).filter(Boolean);

  // Owners sorted by name. Active owners only would require a join; the full
  // owner list is small enough for an admin dropdown and matches findAllOwners.
  const owners = await OwnerModel.findAll({
    attributes: ["id", "username", "type"],
    order: [["username", "ASC"]],
  });

  return {
    owners: owners.map((o) => ({
      id: o.id,
      name: o.username || "",
      type: o.type || null,
    })),
    tiers,
  };
};