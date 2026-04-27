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

/**
 * Get owner details (id and username) by owner IDs
 */
export const getOwnersByIds = async (
  ownerIds: string[],
): Promise<{ id: string; name: string }[]> => {
  if (!ownerIds || ownerIds.length === 0) return [];

  const owners = await OwnerModel.findAll({
    where: { id: { [Op.in]: ownerIds } },
    attributes: ["id", "username"],
  });

  return owners.map((owner) => ({
    id: owner.id,
    name: owner.username || "",
  }));
};
