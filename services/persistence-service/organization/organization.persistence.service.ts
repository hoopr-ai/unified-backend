import { OrganizationModel, type OrganizationDetails } from "./schemas/modules.export";
import { Op } from "sequelize";

export const saveOrganization = async (
  organizationDetails: OrganizationDetails
): Promise<OrganizationDetails> => {
  const organization = await OrganizationModel.create(organizationDetails);
  return organization;
};

export const findAllOrganizations = async (
  limit: number,
  offset: number,
  search?: string
): Promise<{ rows: OrganizationDetails[]; count: number }> => {
  const where = search && search.trim().length > 0
    ? { name: { [Op.iLike]: `%${search.trim().replace(/[%_\\]/g, "\\$&")}%` } }
    : undefined;

  const { rows, count } = await OrganizationModel.findAndCountAll({
    where,
    order: [["createdAt", "DESC"]],
    limit,
    offset,
  });
  return { rows, count };
};

export const updateOrganizationById = async (
  id: number,
  updates: Partial<Pick<OrganizationDetails, "name" | "description" | "status">>
): Promise<void> => {
  await OrganizationModel.update(updates, { where: { id } });
};

export const findOrganizationById = async (
  id: number
): Promise<OrganizationDetails | null> => {
  const organization = await OrganizationModel.findByPk(id);
  return organization;
};

export const findOrganizationByName = async (
  name: string
): Promise<OrganizationDetails | null> => {
  const organization = await OrganizationModel.findOne({
    where: { name },
  });
  return organization;
};
