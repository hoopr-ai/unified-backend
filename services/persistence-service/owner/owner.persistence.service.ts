import { OwnerModel } from "./modules.export";

export const findAllOwners = async (
  limit: number,
  offset: number,
): Promise<{ count: number; rows: OwnerModel[] }> => {
  return OwnerModel.findAndCountAll({
    attributes: ["id", "ownerCode", "username", "type", "subType", "category"],
    order: [["username", "ASC"]],
    limit,
    offset,
  });
};
