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
 * Get owner details (id, username, type) by owner IDs
 */
export const getOwnersByIds = async (
  ownerIds: string[],
): Promise<{ id: string; name: string; type: string | null }[]> => {
  if (!ownerIds || ownerIds.length === 0) return [];

  const owners = await OwnerModel.findAll({
    where: { id: { [Op.in]: ownerIds } },
    attributes: ["id", "username", "type"],
  });

  return owners.map((owner) => ({
    id: owner.id,
    name: owner.username || "",
    type: owner.type || null,
  }));
};

/**
 * Search owners by name (case-insensitive partial match on username field)
 */
export const searchOwnersByName = async (
  searchQuery: string,
  limit: number = 20,
): Promise<{ id: string; name: string; type: string | null }[]> => {
  if (!searchQuery || searchQuery.trim().length === 0) return [];

  const searchTerm = searchQuery.trim();
  const escapedTerm = searchTerm.replace(/[%_\\]/g, "\\$&");

  const owners = await OwnerModel.findAll({
    where: {
      username: { [Op.iLike]: `%${escapedTerm}%` },
    },
    attributes: ["id", "username"],
    order: [["username", "ASC"]],
    limit,
  });

  return owners.map((owner) => ({
    id: owner.id,
    name: owner.username || "",
    type: owner.type || null,
  }));
};
