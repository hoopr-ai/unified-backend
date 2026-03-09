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
