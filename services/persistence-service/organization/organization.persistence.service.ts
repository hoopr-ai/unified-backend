import { OrganizationModel, type OrganizationDetails } from "./schemas/modules.export";

export const saveOrganization = async (
  organizationDetails: OrganizationDetails
): Promise<OrganizationDetails> => {
  const organization = await OrganizationModel.create(organizationDetails);
  return organization;
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
