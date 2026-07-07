import { Op } from "sequelize";
import { OccasionModel, type OccasionDetails } from "./schemas/modules.export";

export const saveOccasion = async (
  occasionDetails: OccasionDetails
): Promise<OccasionDetails> => {
  const occasion = await OccasionModel.create(occasionDetails);
  return occasion;
};

export const findAllOccasions = async (): Promise<OccasionDetails[]> => {
  const occasions = await OccasionModel.findAll({
    order: [["end", "ASC"]],
  });
  return occasions;
};

// ─── CMS write-side (create / edit / delete / image upload) ─────────────────

export const findOccasionById = async (
  id: number,
): Promise<OccasionModel | null> => {
  return await OccasionModel.findByPk(id);
};

// True if any occasion already owns this occasionCode (used by the
// code-generation loop to guarantee uniqueness).
export const occasionCodeExists = async (
  occasionCode: string,
): Promise<boolean> => {
  const found = await OccasionModel.findOne({
    where: { occasionCode },
    attributes: ["id"],
  });
  return found != null;
};

export const createOccasion = async (
  attrs: Partial<OccasionDetails>,
): Promise<OccasionModel> => {
  return await OccasionModel.create(attrs as OccasionDetails);
};

export const updateOccasionById = async (
  id: number,
  patch: Partial<OccasionDetails>,
): Promise<OccasionModel | null> => {
  const occasion = await OccasionModel.findByPk(id);
  if (!occasion) return null;
  await occasion.update(patch);
  return occasion;
};

export const deleteOccasionById = async (id: number): Promise<boolean> => {
  const deleted = await OccasionModel.destroy({ where: { id } });
  return deleted > 0;
};

// For rail-item hydration — resolve by occasionCode OR numeric id, mirroring
// hydratePlaylists' playlistCode-or-id lookup.
export const findOccasionsByCodesOrIds = async (
  codes: string[],
): Promise<OccasionModel[]> => {
  if (codes.length === 0) return [];
  const numericIds = codes.filter((c) => /^\d+$/.test(c)).map(Number);
  return await OccasionModel.findAll({
    where: {
      [Op.or]: numericIds.length > 0
        ? [
            { occasionCode: { [Op.in]: codes } },
            { id: { [Op.in]: numericIds } },
          ]
        : [{ occasionCode: { [Op.in]: codes } }],
    },
    attributes: ["id", "occasionCode", "title", "imageLink"],
  });
};
