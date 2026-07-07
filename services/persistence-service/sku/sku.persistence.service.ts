import { Op, Sequelize } from "sequelize";
import { SkuModel, ItemType } from "./schemas/sku.schema";
import { TrackModel } from "../track/schemas/track.schema";
import { OwnerModel } from "../owner/schemas/owner.schema";
import {
  TrackArtistMappingModel,
  ArtistModel,
} from "../artists/schemas/modules.export";
import { AppError } from "../../helper-service/AppError";

// Vocals filter modes (maps to the boolean/null hasVocals column).
export type VocalsFilter = "vocal" | "instrumental" | "unknown";

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
  status?: string;
  vocals?: VocalsFilter;
  // Artist filter (union of these artist ids, any role).
  artistIds?: string[];
  // 'true' → only tracks that already have a SKU, 'false' → only tracks missing one
  hasSku?: boolean;
}

// Build the shared track WHERE clause from the filter inputs.
//
// No implicit status filter — the dashboard manages pricing for tracks of ANY
// status (a SKU can exist on a non-active track). Callers narrow by status
// explicitly via params.status.
const buildTrackWhere = (params: {
  search?: string;
  ownerId?: string;
  tier?: string;
  status?: string;
  vocals?: VocalsFilter;
  // Restrict to these track ids — used by the artist filter, which is
  // resolved to track ids up-front (see resolveArtistTrackIds).
  trackIdIn?: string[];
}): Record<string | symbol, unknown> => {
  const where: Record<string | symbol, unknown> = {};
  const and: unknown[] = [];

  if (params.status) {
    and.push({ status: params.status });
  }

  if (params.ownerId) {
    and.push({ ownerId: { [Op.overlap]: [params.ownerId] } });
  }

  if (params.tier) {
    and.push({ tier: params.tier });
  }

  if (params.vocals === "vocal") {
    and.push({ hasVocals: true });
  } else if (params.vocals === "instrumental") {
    and.push({ hasVocals: false });
  } else if (params.vocals === "unknown") {
    and.push({ hasVocals: { [Op.is]: null } });
  }

  // Artist filter: trackIdIn is pre-resolved. An empty array means the
  // filter matched no tracks → force a no-results clause.
  if (params.trackIdIn) {
    and.push({ id: { [Op.in]: params.trackIdIn } });
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

// Resolve a set of artist ids to the track ids they are credited on (ANY role —
// not just primary). Returns deduped track ids (union — a track matches if it
// has any of the selected artists). Pre-resolving keeps the main list query free
// of a join (which would break pagination, like the SKU join did).
export const resolveArtistTrackIds = async (
  artistIds: string[],
): Promise<string[]> => {
  if (artistIds.length === 0) return [];
  const rows = await TrackArtistMappingModel.findAll({
    where: { artistId: { [Op.in]: artistIds } },
    attributes: ["trackId"],
    raw: true,
  });
  return [
    ...new Set(rows.map((r) => (r as unknown as { trackId: string }).trackId)),
  ];
};

// Typeahead source for the artist filter dropdown.
export const searchArtistsForFilter = async (
  search: string,
  limit = 20,
): Promise<{ id: string; name: string; artistCode: string }[]> => {
  const term = (search ?? "").trim();
  if (term.length === 0) return [];
  const escaped = term.replace(/[%_\\]/g, "\\$&");
  const artists = await ArtistModel.findAll({
    where: {
      [Op.or]: [
        { name: { [Op.iLike]: `%${escaped}%` } },
        { artistCode: { [Op.iLike]: `%${escaped}%` } },
      ],
    },
    attributes: ["id", "name", "artistCode"],
    order: [["name", "ASC"]],
    limit,
  });
  return artists.map((a) => ({
    id: a.id,
    name: a.name,
    artistCode: a.artistCode,
  }));
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

// Filter tracks by SKU presence WITHOUT joining SKUs into the paginated query —
// a hasMany join + LIMIT can drop or duplicate track rows (tier/owner are
// incidental to which rows go missing). Uses an UNCORRELATED subquery on
// trackCode (no dependency on the main table's internal alias), so it's robust:
//   hasSku=true  → trackCode IN  (codes that have a TRACK sku)
//   hasSku=false → trackCode NOT IN (...)  → includes tracks with no SKU at all
const skuPresenceCondition = (mustHaveSku: boolean) => ({
  trackCode: {
    [mustHaveSku ? Op.in : Op.notIn]: Sequelize.literal(
      `(SELECT "trackCode" FROM "SKUs" WHERE "itemType" = '${ItemType.TRACK}')`,
    ),
  },
});

export const listTracksWithSku = async (
  params: ListTracksWithSkuParams,
): Promise<{ rows: TrackSkuRow[]; count: number }> => {
  const offset = (params.page - 1) * params.limit;

  // Resolve the artist filter to track ids before building the where.
  const trackIdIn = params.artistIds?.length
    ? await resolveArtistTrackIds(params.artistIds)
    : undefined;

  const where = buildTrackWhere({ ...params, trackIdIn });

  // hasSku is enforced in SQL via EXISTS so pagination + count stay correct and
  // no track is ever dropped by a join.
  if (params.hasSku !== undefined) {
    const and = (where[Op.and] as unknown[] | undefined) ?? [];
    and.push(skuPresenceCondition(params.hasSku === true));
    where[Op.and] = and;
  }

  // Paginate tracks with NO association join — clean, correct, never drops
  // null-tier (or any) rows.
  const { count, rows } = await TrackModel.findAndCountAll({
    where,
    attributes: ["id", "trackCode", "name", "tier", "status", "ownerId"],
    order: [["createdAt", "DESC"]],
    limit: params.limit,
    offset,
  });

  const json = rows.map((r) => r.toJSON() as {
    id: string;
    trackCode: string;
    name: string | null;
    tier: string | null;
    status: string | null;
    ownerId: string[] | null;
  });

  // Fetch the SKUs for this page's tracks in one separate query, then map.
  const trackCodes = json.map((t) => t.trackCode);
  const skuMap = new Map<string, SkuModel>();
  if (trackCodes.length > 0) {
    const skus = await SkuModel.findAll({
      where: { trackCode: { [Op.in]: trackCodes }, itemType: ItemType.TRACK },
    });
    for (const s of skus) {
      if (!skuMap.has(s.trackCode)) skuMap.set(s.trackCode, s);
    }
  }

  // Resolve owner display names in one batched query.
  const allOwnerIds = json.flatMap((t) => t.ownerId ?? []);
  const ownerMap = await buildOwnerMap(allOwnerIds);

  const mapped: TrackSkuRow[] = json.map((t) => {
    const sku = pickTrackSku(skuMap.has(t.trackCode) ? [skuMap.get(t.trackCode)!] : undefined);
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

  return { rows: mapped, count };
};

// All trackCodes matching a filter — used by bulk upsert so it can target the
// whole matching set, not just the current page. Optionally restricted to
// tracks that are missing a SKU.
export const findTrackCodesByFilter = async (params: {
  search?: string;
  ownerId?: string;
  tier?: string;
  status?: string;
  vocals?: VocalsFilter;
  artistIds?: string[];
  onlyMissingSku?: boolean;
}): Promise<string[]> => {
  const trackIdIn = params.artistIds?.length
    ? await resolveArtistTrackIds(params.artistIds)
    : undefined;

  const where = buildTrackWhere({ ...params, trackIdIn });

  // "missing SKU only" → trackCode NOT IN (sku codes). No join, no in-memory filter.
  if (params.onlyMissingSku) {
    const and = (where[Op.and] as unknown[] | undefined) ?? [];
    and.push(skuPresenceCondition(false));
    where[Op.and] = and;
  }

  const rows = await TrackModel.findAll({
    where,
    attributes: ["trackCode"],
    raw: true,
  });

  return rows.map((r) => (r as unknown as { trackCode: string }).trackCode);
};

// Validate that every supplied trackCode is a real track (any status — pricing
// is allowed on non-active tracks too). Returns the subset that exists so the
// caller can report unknown codes.
export const filterExistingTrackCodes = async (
  trackCodes: string[],
): Promise<string[]> => {
  if (trackCodes.length === 0) return [];
  const rows = await TrackModel.findAll({
    where: { trackCode: { [Op.in]: trackCodes } },
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

// Selling price can never exceed cost price. Joi already rejects a single
// request that sets both inconsistently, but a partial update (only one of
// the two supplied) is validated here against whichever value — new or
// pre-existing — ends up on the record after the merge. No cap is enforced
// once either side is unset (null/undefined) — that just means "no ceiling".
const assertValidPriceOrder = (
  costPrice: number | null | undefined,
  sellingPrice: number | null | undefined,
): void => {
  if (
    costPrice === undefined ||
    costPrice === null ||
    sellingPrice === undefined ||
    sellingPrice === null
  ) {
    return;
  }
  if (sellingPrice > costPrice) {
    throw new AppError(
      "Selling price must be less than or equal to cost price.",
      400,
    );
  }
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
    assertValidPriceOrder(existing.costPrice, existing.sellingPrice);
    await existing.save();
    return { sku: existing, created: false };
  }

  const costPrice = values.costPrice ?? undefined;
  const sellingPrice = values.sellingPrice ?? undefined;
  assertValidPriceOrder(costPrice, sellingPrice);

  const created = await SkuModel.create({
    id: generateSkuId(),
    trackCode,
    itemType: ItemType.TRACK,
    costPrice,
    sellingPrice,
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
        assertValidPriceOrder(existing.costPrice, existing.sellingPrice);
        await existing.save({ transaction });
        updated += 1;
      } else {
        const costPrice = values.costPrice ?? undefined;
        const sellingPrice = values.sellingPrice ?? undefined;
        assertValidPriceOrder(costPrice, sellingPrice);
        toCreate.push({
          id: generateSkuId(),
          trackCode,
          itemType: ItemType.TRACK,
          costPrice,
          sellingPrice,
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

// Filter dropdown data: owners, the distinct set of tiers in use, and the
// distinct set of track statuses (all computed across every track, not just
// active ones, since the dashboard now spans all statuses).
export const getSkuFilterOptions = async (): Promise<{
  owners: { id: string; name: string; type: string | null }[];
  tiers: string[];
  statuses: string[];
}> => {
  // Distinct tiers across all tracks.
  const tierRows = (await TrackModel.findAll({
    where: { tier: { [Op.ne]: null as unknown as string } },
    attributes: [[Sequelize.fn("DISTINCT", Sequelize.col("tier")), "tier"]],
    order: [["tier", "ASC"]],
    raw: true,
  })) as unknown as { tier: string }[];
  const tiers = tierRows.map((r) => r.tier).filter(Boolean);

  // Distinct track statuses in use.
  const statusRows = (await TrackModel.findAll({
    where: { status: { [Op.ne]: null as unknown as string } },
    attributes: [[Sequelize.fn("DISTINCT", Sequelize.col("status")), "status"]],
    order: [["status", "ASC"]],
    raw: true,
  })) as unknown as { status: string }[];
  const statuses = statusRows.map((r) => r.status).filter(Boolean);

  // Owners sorted by name. The full owner list is small enough for an admin
  // dropdown and matches findAllOwners.
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
    statuses,
  };
};