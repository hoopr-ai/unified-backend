import { Op } from "sequelize";
import { sequelize } from "../database";
import { RailModel, RailDetails } from "./schemas/rail.schema";
import { RailItemModel, RailItemDetails } from "./schemas/rail-item.schema";
import { PageName } from "../../dto-service/modules.export";

// Returns all rails visible to the given brand: brand-specific rows + defaults.
// Caller dedupes by key (brand row wins).
export const findRailsForBrand = async (
  brandId?: number,
  pageName?: string,
): Promise<RailModel[]> => {
  const brandClause = brandId
    ? { [Op.or]: [{ brandId }, { brandId: null as number | null }] }
    : { brandId: null as number | null };

  // Check if any of the pageNames array contains the requested pageName
  const pageClause = pageName
    ? { pageNames: { [Op.contains]: [pageName] } }
    : {};

  return RailModel.findAll({
    where: {
      isVisible: true,
      ...brandClause,
      ...pageClause,
    },
    include: [
      {
        model: RailItemModel,
        as: "items",
        required: false,
      },
    ],
    order: [
      ["order", "ASC"],
      [{ model: RailItemModel, as: "items" }, "order", "ASC"],
    ],
  });
};

// Returns paginated rails visible to the given brand with total count.
// Fetches rails in batches for better performance.
export const findRailsForBrandPaginated = async (
  brandId?: number,
  pageName?: string,
  page: number = 1,
  limit: number = 10,
): Promise<{ rows: RailModel[]; count: number }> => {
  const brandClause = brandId
    ? { [Op.or]: [{ brandId }, { brandId: null as number | null }] }
    : { brandId: null as number | null };

  // Check if any of the pageNames array contains the requested pageName
  const pageClause = pageName
    ? { pageNames: { [Op.contains]: [pageName] } }
    : {};

  const offset = (page - 1) * limit;

  const { rows, count } = await RailModel.findAndCountAll({
    where: {
      isVisible: true,
      ...brandClause,
      ...pageClause,
    },
    include: [
      {
        model: RailItemModel,
        as: "items",
        required: false,
      },
    ],
    order: [
      ["order", "ASC"],
      [{ model: RailItemModel, as: "items" }, "order", "ASC"],
    ],
    limit,
    offset,
    distinct: true, // Ensures count is accurate with includes
  });

  return { rows, count };
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

export const getMaxRailOrder = async (
  brandId: number | null,
): Promise<number> => {
  const row = await RailModel.findOne({
    where: { brandId: brandId ?? (null as number | null) },
    order: [["order", "DESC"]],
    attributes: ["order"],
  });
  return row?.order ?? -1;
};

export const getMinRailOrder = async (
  brandId: number | null,
): Promise<number> => {
  const row = await RailModel.findOne({
    where: { brandId: brandId ?? (null as number | null) },
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
  pageNames: PageName[];
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

export const upsertRailWithItems = async (
  input: UpsertRailInput,
  items: RailItemInput[],
): Promise<{ rail: RailDetails; items: RailItemDetails[] }> => {
  const transaction = await sequelize.transaction();
  try {
    const [rail] = await RailModel.upsert(input as unknown as RailDetails, {
      transaction,
      conflictFields: ["key", "brandId"],
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

    return {
      rail: rail.toJSON() as RailDetails,
      items: created.map((i) => i.toJSON() as RailItemDetails),
    };
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
};
