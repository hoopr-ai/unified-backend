import { FaqSectionModel, type FaqSectionDetails } from "./schemas/modules.export";
import type { Platform } from "../../dto-service/constants/common.enums";

export const saveFaqSection = async (
  sectionDetails: FaqSectionDetails
): Promise<FaqSectionDetails> => {
  const section = await FaqSectionModel.create(sectionDetails);
  return section;
};

export const findFaqSectionById = async (
  id: number
): Promise<FaqSectionDetails | null> => {
  const section = await FaqSectionModel.findByPk(id);
  return section;
};

export const findFaqSectionsByPlatform = async (
  platform: Platform
): Promise<FaqSectionDetails[]> => {
  const sections = await FaqSectionModel.findAll({
    where: { platform, isActive: true },
    order: [["order", "ASC"]],
  });
  return sections;
};

export const findFaqSectionBySlug = async (
  platform: Platform,
  slug: string
): Promise<FaqSectionDetails | null> => {
  const section = await FaqSectionModel.findOne({
    where: { platform, slug, isActive: true },
  });
  return section;
};

export const updateFaqSectionById = async (
  id: number,
  updates: Partial<FaqSectionDetails>
): Promise<FaqSectionDetails | null> => {
  const section = await FaqSectionModel.findByPk(id);
  if (!section) return null;
  await section.update(updates);
  return section;
};

export const deleteFaqSectionById = async (id: number): Promise<boolean> => {
  const section = await FaqSectionModel.findByPk(id);
  if (!section) return false;
  await section.update({ isActive: false });
  return true;
};

export const bulkUpdateFaqSectionOrders = async (
  sectionOrders: { id: number; order: number }[]
): Promise<void> => {
  await Promise.all(
    sectionOrders.map(({ id, order }) =>
      FaqSectionModel.update({ order }, { where: { id } })
    )
  );
};
