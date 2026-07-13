import { Op } from "sequelize";
import { QuickAddModel, type QuickAddDetails } from "./schemas/modules.export";

export const findAllQuickAdds = async (
  activeOnly = false,
): Promise<QuickAddModel[]> => {
  return await QuickAddModel.findAll({
    where: activeOnly ? { isActive: true } : undefined,
    order: [["id", "ASC"]],
  });
};

export const findQuickAddById = async (
  id: number,
): Promise<QuickAddModel | null> => {
  return await QuickAddModel.findByPk(id);
};

// True if any quick add already owns this code (used by the code-generation
// loop to guarantee uniqueness).
export const quickAddCodeExists = async (
  quickAddCode: string,
): Promise<boolean> => {
  const found = await QuickAddModel.findOne({
    where: { quickAddCode },
    attributes: ["id"],
  });
  return found != null;
};

export const createQuickAdd = async (
  attrs: Partial<QuickAddDetails>,
): Promise<QuickAddModel> => {
  return await QuickAddModel.create(attrs as QuickAddDetails);
};

export const updateQuickAddById = async (
  id: number,
  patch: Partial<QuickAddDetails>,
): Promise<QuickAddModel | null> => {
  const quickAdd = await QuickAddModel.findByPk(id);
  if (!quickAdd) return null;
  await quickAdd.update(patch);
  return quickAdd;
};

export const deleteQuickAddById = async (id: number): Promise<boolean> => {
  const deleted = await QuickAddModel.destroy({ where: { id } });
  return deleted > 0;
};

// Resolve by quickAddCode OR numeric id, for the public GET /quick-adds/:idOrCode.
export const findQuickAddByCodeOrId = async (
  idOrCode: string,
): Promise<QuickAddModel | null> => {
  const numericId = /^\d+$/.test(idOrCode) ? Number(idOrCode) : undefined;
  return await QuickAddModel.findOne({
    where: {
      [Op.or]:
        numericId != null
          ? [{ quickAddCode: idOrCode }, { id: numericId }]
          : [{ quickAddCode: idOrCode }],
    },
  });
};
