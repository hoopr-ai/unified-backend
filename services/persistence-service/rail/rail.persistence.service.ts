import { Op } from "sequelize";
import { sequelize } from "../database";
import { RailModel, RailDetails } from "./schemas/rail.schema";
import { RailItemModel, RailItemDetails } from "./schemas/rail-item.schema";

// Returns all rails visible to the given brand: brand-specific rows + defaults.
// Caller dedupes by key (brand row wins).
export const findRailsForBrand = async (
  brandId?: number,
): Promise<RailModel[]> => {
  const brandClause = brandId
    ? { [Op.or]: [{ brandId }, { brandId: null as number | null }] }
    : { brandId: null as number | null };

  return RailModel.findAll({
    where: {
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
    order: [
      ["order", "ASC"],
      [{ model: RailItemModel, as: "items" }, "order", "ASC"],
    ],
  });
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

export interface UpsertRailInput {
  key: string;
  title: string;
  subtitle?: string | null;
  type: string;
  subType?: string | null;
  brandId: number | null;
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
