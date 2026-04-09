import { OwnerModel } from "./modules.export";
import { Op, fn, col, where } from "sequelize";

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

/**
 * Get owner IDs by owner names (case-insensitive match on username field)
 */
export const getOwnerIdsByNames = async (
  ownerNames: string[],
): Promise<string[]> => {
  if (!ownerNames || ownerNames.length === 0) return [];

  const lowerNames = ownerNames.map((name) => name.toLowerCase().trim());
  const owners = await OwnerModel.findAll({
    where: where(fn("LOWER", col("username")), { [Op.in]: lowerNames }) as any,
    attributes: ["id"],
  });

  return owners.map((owner) => owner.id);
};
