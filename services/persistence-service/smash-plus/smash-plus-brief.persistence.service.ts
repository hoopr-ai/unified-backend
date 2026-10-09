import { SmashPlusBriefModel, type SmashPlusBriefAttributes } from "./schemas/modules.export";

export const saveSmashPlusBrief = async (
  details: SmashPlusBriefAttributes
): Promise<SmashPlusBriefModel> => {
  return SmashPlusBriefModel.create(details);
};
