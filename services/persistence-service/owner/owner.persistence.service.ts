import { OwnerModel } from "./modules.export";
import type { UsageInfoDto } from "../../dto-service/owners/owners.dto";
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

// ── Admin: owner usage-info CMS ───────────────────────────────────────────

/**
 * Paginated owner list for the usage-info CMS. Optional case-insensitive search
 * matches ownerCode OR username. Selects usageInfo only to derive the
 * has-usage-info flag (the full blob is fetched on the detail call).
 */
export const findOwnersForAdmin = async (
  limit: number,
  offset: number,
  search?: string,
): Promise<{ count: number; rows: OwnerModel[] }> => {
  const trimmed = search?.trim();
  const whereClause = trimmed
    ? {
        [Op.or]: [
          { ownerCode: { [Op.iLike]: `%${trimmed.replace(/[%_\\]/g, "\\$&")}%` } },
          { username: { [Op.iLike]: `%${trimmed.replace(/[%_\\]/g, "\\$&")}%` } },
        ],
      }
    : undefined;

  return OwnerModel.findAndCountAll({
    attributes: ["id", "ownerCode", "username", "type", "usageInfo"],
    where: whereClause,
    order: [["username", "ASC"]],
    limit,
    offset,
  });
};

/** Single owner (all fields the usage-info editor needs) by primary key. */
export const findOwnerById = async (
  id: string,
): Promise<OwnerModel | null> => {
  return OwnerModel.findByPk(id, {
    attributes: [
      "id",
      "ownerCode",
      "username",
      "type",
      "subType",
      "category",
      "usageInfo",
    ],
  });
};

/**
 * Overwrite an owner's usageInfo JSONB with the validated blob. Returns the
 * refreshed row, or null if the owner id doesn't exist.
 */
export const updateOwnerUsageInfo = async (
  id: string,
  usageInfo: UsageInfoDto,
): Promise<OwnerModel | null> => {
  const owner = await OwnerModel.findByPk(id);
  if (!owner) return null;
  await owner.update({ usageInfo });
  return owner;
};

export interface OwnerIdentity {
  id: string;
  ownerCode: string | null;
  name: string;
  type: string | null;
}

/**
 * Get owner identities (id, ownerCode, username, type) by owner names
 * (case-insensitive match on username field). Access checks need the ownerCode
 * to match rail LABEL items and the type to match blanket token allocations,
 * so they resolve the full identity rather than ids alone.
 */
export const getOwnerIdentitiesByNames = async (
  ownerNames: string[],
): Promise<OwnerIdentity[]> => {
  if (!ownerNames || ownerNames.length === 0) return [];

  const lowerNames = ownerNames.map((name) => name.toLowerCase().trim());
  const owners = await OwnerModel.findAll({
    where: where(fn("LOWER", col("username")), { [Op.in]: lowerNames }) as any,
    attributes: ["id", "ownerCode", "username", "type"],
  });

  return owners.map((owner) => ({
    id: owner.id,
    ownerCode: owner.ownerCode ?? null,
    name: owner.username || "",
    type: owner.type || null,
  }));
};

/**
 * Get owner IDs by owner names (case-insensitive match on username field)
 */
export const getOwnerIdsByNames = async (
  ownerNames: string[],
): Promise<string[]> => {
  const owners = await getOwnerIdentitiesByNames(ownerNames);
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
