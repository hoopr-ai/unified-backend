import { Op } from "sequelize";
import { sequelize } from "../database";
import { RailModel, RailDetails } from "./schemas/rail.schema";
import { RailItemModel, RailItemDetails } from "./schemas/rail-item.schema";
import { PageName } from "../../dto-service/modules.export";
import { redisClient } from "../../helper-service/redis.client";

// Cache TTL in seconds (10 minutes for rails, auto-invalidated on updates)
const RAILS_CACHE_TTL = 600;

// Build cache key for rails query
const buildRailsCacheKey = (brandId?: number, pageName?: string, page?: number, limit?: number): string => {
  return `rails:${brandId ?? 'default'}:${pageName ?? 'all'}:${page ?? 0}:${limit ?? 0}`;
};

// Invalidate rails cache for a brand/page
export const invalidateRailsCache = async (brandId?: number | null, pageName?: string): Promise<void> => {
  try {
    const pattern = `rails:${brandId ?? 'default'}:${pageName ?? '*'}:*`;
    const keys = await redisClient.keys(pattern);
    if (keys.length > 0) {
      await redisClient.del(...keys);
    }
    // Also invalidate 'all' pages cache
    if (pageName) {
      const allPattern = `rails:${brandId ?? 'default'}:all:*`;
      const allKeys = await redisClient.keys(allPattern);
      if (allKeys.length > 0) {
        await redisClient.del(...allKeys);
      }
    }
  } catch (err) {
    console.error('[RailsCache] Error invalidating cache:', err);
  }
};

// Returns all rails visible to the given brand: brand-specific rows + defaults.
// Caller dedupes by key (brand row wins).
// Optimized: Separate queries for rails and items to avoid slow JOINs
export const findRailsForBrand = async (
  brandId?: number,
  pageName?: string,
): Promise<RailModel[]> => {
  // Try cache first
  const cacheKey = buildRailsCacheKey(brandId, pageName);
  try {
    const cached = await redisClient.get(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached);
      return parsed.map((r: any) => {
        const rail = RailModel.build(r, { isNewRecord: false });
        if (r.items) {
          rail.items = r.items.map((i: any) => RailItemModel.build(i, { isNewRecord: false }));
        }
        return rail;
      });
    }
  } catch (err) {
    console.error('[RailsCache] Error reading cache:', err);
  }

  const brandClause = brandId
    ? { [Op.or]: [{ brandId }, { brandId: null as number | null }] }
    : { brandId: null as number | null };

  // Filter by pageName (single value, not array)
  const pageClause = pageName
    ? { pageName }
    : {};

  // Step 1: Fetch rails without items (faster query)
  const rails = await RailModel.findAll({
    where: {
      isVisible: true,
      ...brandClause,
      ...pageClause,
    },
    order: [["order", "ASC"]],
    raw: false,
  });

  if (rails.length === 0) return rails;

  // Step 2: Batch fetch all items for these rails in one query
  const railIds = rails.map(r => r.id);
  const items = await RailItemModel.findAll({
    where: { railId: { [Op.in]: railIds } },
    order: [["railId", "ASC"], ["order", "ASC"]],
    raw: false,
  });

  // Step 3: Group items by railId
  const itemsByRailId = new Map<number, RailItemModel[]>();
  for (const item of items) {
    const list = itemsByRailId.get(item.railId) || [];
    list.push(item);
    itemsByRailId.set(item.railId, list);
  }

  // Step 4: Attach items to rails
  for (const rail of rails) {
    rail.items = itemsByRailId.get(rail.id) || [];
  }

  // Cache the result
  try {
    const toCache = rails.map(r => {
      const json = r.toJSON() as any;
      json.items = (r.items || []).map(i => i.toJSON());
      return json;
    });
    await redisClient.setex(cacheKey, RAILS_CACHE_TTL, JSON.stringify(toCache));
  } catch (err) {
    console.error('[RailsCache] Error writing cache:', err);
  }

  return rails;
};

// Returns paginated rails visible to the given brand with total count.
// Optimized: Separate count query and data query to avoid slow JOIN count
export const findRailsForBrandPaginated = async (
  brandId?: number,
  pageName?: string,
  page: number = 1,
  limit: number = 10,
): Promise<{ rows: RailModel[]; count: number }> => {
  // Try cache first
  const cacheKey = buildRailsCacheKey(brandId, pageName, page, limit);
  try {
    const cached = await redisClient.get(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached);
      const rows = parsed.rows.map((r: any) => {
        const rail = RailModel.build(r, { isNewRecord: false });
        if (r.items) {
          rail.items = r.items.map((i: any) => RailItemModel.build(i, { isNewRecord: false }));
        }
        return rail;
      });
      return { rows, count: parsed.count };
    }
  } catch (err) {
    console.error('[RailsCache] Error reading paginated cache:', err);
  }

  const brandClause = brandId
    ? { [Op.or]: [{ brandId }, { brandId: null as number | null }] }
    : { brandId: null as number | null };

  // Filter by pageName (single value, not array)
  const pageClause = pageName
    ? { pageName }
    : {};

  const offset = (page - 1) * limit;
  const whereClause = {
    isVisible: true,
    ...brandClause,
    ...pageClause,
  };

  // Step 1: Get count separately (fast, no JOIN)
  const count = await RailModel.count({ where: whereClause });

  if (count === 0) {
    return { rows: [], count: 0 };
  }

  // Step 2: Fetch rails without items (faster query)
  const rails = await RailModel.findAll({
    where: whereClause,
    order: [["order", "ASC"]],
    limit,
    offset,
    raw: false,
  });

  if (rails.length === 0) {
    return { rows: rails, count };
  }

  // Step 3: Batch fetch all items for these rails in one query
  const railIds = rails.map(r => r.id);
  const items = await RailItemModel.findAll({
    where: { railId: { [Op.in]: railIds } },
    order: [["railId", "ASC"], ["order", "ASC"]],
    raw: false,
  });

  // Step 4: Group items by railId
  const itemsByRailId = new Map<number, RailItemModel[]>();
  for (const item of items) {
    const list = itemsByRailId.get(item.railId) || [];
    list.push(item);
    itemsByRailId.set(item.railId, list);
  }

  // Step 5: Attach items to rails
  for (const rail of rails) {
    rail.items = itemsByRailId.get(rail.id) || [];
  }

  // Cache the result
  try {
    const toCache = {
      rows: rails.map(r => {
        const json = r.toJSON() as any;
        json.items = (r.items || []).map(i => i.toJSON());
        return json;
      }),
      count,
    };
    await redisClient.setex(cacheKey, RAILS_CACHE_TTL, JSON.stringify(toCache));
  } catch (err) {
    console.error('[RailsCache] Error writing paginated cache:', err);
  }

  return { rows: rails, count };
};

export const findRailByKey = async (
  key: string,
  brandId?: number,
): Promise<RailModel[]> => {
  const brandClause = brandId
    ? { [Op.or]: [{ brandId }, { brandId: null as number | null }] }
    : { brandId: null as number | null };

  return RailModel.findAll({
    where: {
      key,
      isVisible: true,
      ...brandClause,
    },
    include: [
      {
        model: RailItemModel,
        as: "items",
        required: false,
      },
    ],
    order: [[{ model: RailItemModel, as: "items" }, "order", "ASC"]],
  });
};

export const findRailByKeyAndBrand = async (
  key: string,
  brandId: number | null,
): Promise<RailModel | null> => {
  return RailModel.findOne({
    where: { key, brandId: brandId ?? (null as number | null) },
  });
};

export const findRailByKeyBrandAndPage = async (
  key: string,
  brandId: number | null,
  pageName: PageName,
): Promise<RailModel | null> => {
  return RailModel.findOne({
    where: { key, brandId: brandId ?? (null as number | null), pageName },
  });
};

export const getMaxRailOrder = async (
  brandId: number | null,
  pageName?: PageName,
): Promise<number> => {
  const whereClause: Record<string, unknown> = { brandId: brandId ?? (null as number | null) };
  if (pageName) {
    whereClause.pageName = pageName;
  }
  const row = await RailModel.findOne({
    where: whereClause,
    order: [["order", "DESC"]],
    attributes: ["order"],
  });
  return row?.order ?? -1;
};

export const getMinRailOrder = async (
  brandId: number | null,
  pageName?: PageName,
): Promise<number> => {
  const whereClause: Record<string, unknown> = { brandId: brandId ?? (null as number | null) };
  if (pageName) {
    whereClause.pageName = pageName;
  }
  const row = await RailModel.findOne({
    where: whereClause,
    order: [["order", "ASC"]],
    attributes: ["order"],
  });
  return row?.order ?? 0;
};

export interface UpsertRailInput {
  key: string;
  title: string;
  subtitle?: string | null;
  type: string;
  subType?: string | null;
  brandId: number | null;
  pageName: PageName;
  sourceType: string;
  sourceConfig?: Record<string, unknown> | null;
  order: number;
  isVisible: boolean;
}

export interface RailItemInput {
  itemType: string;
  itemCode: string;
  order: number;
  isLocked?: boolean;
}

// Find a rail by ID (with items)
export const findRailById = async (
  railId: number,
): Promise<RailModel | null> => {
  return RailModel.findOne({
    where: { id: railId },
    include: [
      {
        model: RailItemModel,
        as: "items",
        required: false,
      },
    ],
    order: [[{ model: RailItemModel, as: "items" }, "order", "ASC"]],
  });
};

// Hard delete a rail and its items
export const deleteRailById = async (
  railId: number,
): Promise<boolean> => {
  // Get rail info before deleting for cache invalidation
  const rail = await RailModel.findByPk(railId, { attributes: ['brandId', 'pageName'] });

  const transaction = await sequelize.transaction();
  try {
    // Delete all items first
    await RailItemModel.destroy({
      where: { railId },
      transaction,
    });

    // Delete the rail
    const deleted = await RailModel.destroy({
      where: { id: railId },
      transaction,
    });

    await transaction.commit();

    // Invalidate cache
    if (rail) {
      await invalidateRailsCache(rail.brandId, rail.pageName);
    }

    return deleted > 0;
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
};

// Update rail items (handles delete, freeze/unfreeze, reorder, add)
export interface UpdateRailItemInput {
  id?: number;           // Existing item ID (for update/delete)
  itemType: string;
  itemCode: string;
  order: number;
  isLocked?: boolean;
}

export const updateRailItems = async (
  railId: number,
  items: UpdateRailItemInput[],
): Promise<RailItemDetails[]> => {
  const transaction = await sequelize.transaction();
  try {
    // Get current items
    const currentItems = await RailItemModel.findAll({
      where: { railId },
      transaction,
    });
    const currentItemIds = new Set(currentItems.map((i) => i.id));

    // Separate items into updates and creates
    const itemsWithId = items.filter((i) => i.id != null);
    const itemsToCreate = items.filter((i) => i.id == null);

    // Find items to delete (current items not in the new list)
    const newItemIds = new Set(itemsWithId.map((i) => i.id));
    const itemsToDelete = Array.from(currentItemIds).filter((id) => !newItemIds.has(id));

    // Delete removed items
    if (itemsToDelete.length > 0) {
      await RailItemModel.destroy({
        where: { id: { [Op.in]: itemsToDelete } },
        transaction,
      });
    }

    // Update existing items
    for (const item of itemsWithId) {
      await RailItemModel.update(
        {
          order: item.order,
          isLocked: item.isLocked ?? false,
        },
        {
          where: { id: item.id, railId },
          transaction,
        },
      );
    }

    // Create new items
    if (itemsToCreate.length > 0) {
      await RailItemModel.bulkCreate(
        itemsToCreate.map((item) => ({
          railId,
          itemType: item.itemType,
          itemCode: item.itemCode,
          order: item.order,
          isLocked: item.isLocked ?? false,
        })) as unknown as RailItemDetails[],
        { transaction },
      );
    }

    await transaction.commit();

    // Fetch and return updated items
    const updatedItems = await RailItemModel.findAll({
      where: { railId },
      order: [["order", "ASC"]],
    });

    return updatedItems.map((i) => i.toJSON() as RailItemDetails);
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
};

// Bulk update rail orders
export const bulkUpdateRailOrders = async (
  railOrders: { id: number; order: number }[],
  pageName?: PageName,
  brandId?: number | null,
): Promise<void> => {
  await Promise.all(
    railOrders.map(({ id, order }) =>
      RailModel.update({ order }, { where: { id } })
    )
  );

  // Invalidate cache for this page
  if (pageName) {
    await invalidateRailsCache(brandId, pageName);
  }
};

export const upsertRailWithItems = async (
  input: UpsertRailInput,
  items: RailItemInput[],
): Promise<{ rail: RailDetails; items: RailItemDetails[] }> => {
  const transaction = await sequelize.transaction();
  try {
    const [rail] = await RailModel.upsert(input as unknown as RailDetails, {
      transaction,
      conflictFields: ["key", "brandId", "pageName"],
    });

    await RailItemModel.destroy({
      where: { railId: rail.id },
      transaction,
    });

    const created = items.length
      ? await RailItemModel.bulkCreate(
          items.map((item) => ({
            railId: rail.id,
            itemType: item.itemType,
            itemCode: item.itemCode,
            order: item.order,
            isLocked: item.isLocked ?? false,
          })) as unknown as RailItemDetails[],
          { transaction },
        )
      : [];

    await transaction.commit();

    // Invalidate cache for this brand and page
    await invalidateRailsCache(input.brandId, input.pageName);

    return {
      rail: rail.toJSON() as RailDetails,
      items: created.map((i) => i.toJSON() as RailItemDetails),
    };
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
};
// Copy a rail to multiple target pages
export interface CopyRailResult {
  sourceRailId: number;
  copiedTo: Array<{
    pageName: PageName;
    railId: number;
    itemsCopied: number;
  }>;
  skipped: Array<{
    pageName: PageName;
    reason: string;
  }>;
}

export const copyRailToPages = async (
  railId: number,
  targetPageNames: PageName[],
  brandId?: number | null,
): Promise<CopyRailResult> => {
  const result: CopyRailResult = {
    sourceRailId: railId,
    copiedTo: [],
    skipped: [],
  };

  // Find the source rail with its items
  const sourceRail = await findRailById(railId);
  if (!sourceRail) {
    throw new Error(`Rail with ID ${railId} not found`);
  }

  const sourceItems = sourceRail.items || [];

  for (const targetPageName of targetPageNames) {
    // Skip if target page is the same as source
    if (targetPageName === sourceRail.pageName) {
      result.skipped.push({
        pageName: targetPageName,
        reason: "Same as source page",
      });
      continue;
    }

    // Check if rail with same key already exists on target page
    const existingRail = await findRailByKeyBrandAndPage(
      sourceRail.key,
      brandId ?? sourceRail.brandId ?? null,
      targetPageName,
    );

    if (existingRail) {
      result.skipped.push({
        pageName: targetPageName,
        reason: `Rail with key "${sourceRail.key}" already exists on this page`,
      });
      continue;
    }

    // Get the max order for the target page to add at the end
    const maxOrder = await getMaxRailOrder(brandId ?? sourceRail.brandId ?? null, targetPageName);
    const newOrder = maxOrder + 1;

    // Create the new rail
    const transaction = await sequelize.transaction();
    try {
      const newRail = await RailModel.create(
        {
          key: sourceRail.key,
          title: sourceRail.title,
          subtitle: sourceRail.subtitle,
          type: sourceRail.type,
          subType: sourceRail.subType,
          brandId: brandId ?? sourceRail.brandId,
          pageName: targetPageName,
          sourceType: sourceRail.sourceType,
          sourceConfig: sourceRail.sourceConfig,
          order: newOrder,
          isVisible: sourceRail.isVisible,
        } as RailDetails,
        { transaction },
      );

      // Copy items to the new rail
      if (sourceItems.length > 0) {
        await RailItemModel.bulkCreate(
          sourceItems.map((item) => ({
            railId: newRail.id,
            itemType: item.itemType,
            itemCode: item.itemCode,
            order: item.order,
            isLocked: item.isLocked ?? false,
          })) as unknown as RailItemDetails[],
          { transaction },
        );
      }

      await transaction.commit();

      // Invalidate cache for the target page
      await invalidateRailsCache(brandId ?? sourceRail.brandId, targetPageName);

      result.copiedTo.push({
        pageName: targetPageName,
        railId: Number(newRail.id),
        itemsCopied: sourceItems.length,
      });
    } catch (err) {
      await transaction.rollback();
      result.skipped.push({
        pageName: targetPageName,
        reason: `Error: ${(err as Error).message}`,
      });
    }
  }

  return result;
};
