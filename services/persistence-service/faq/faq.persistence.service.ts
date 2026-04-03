import { Op } from "sequelize";
import { FaqModel, type FaqDetails } from "./schemas/modules.export";
import type { Platform } from "../../dto-service/constants/common.enums";
import type { FaqSection } from "../../dto-service/faq/faq.enum";

export const saveFaq = async (faqDetails: FaqDetails): Promise<FaqDetails> => {
  const faq = await FaqModel.create(faqDetails);
  return faq;
};

export const findFaqById = async (id: number): Promise<FaqDetails | null> => {
  const faq = await FaqModel.findByPk(id);
  return faq;
};

export const findFaqsByPlatform = async (
  platform: Platform,
  section?: FaqSection
): Promise<FaqDetails[]> => {
  const where: Record<string, unknown> = { platform, isActive: true };
  if (section) where.section = section;

  const faqs = await FaqModel.findAll({
    where,
    order: [
      ["section", "ASC"],
      ["order", "ASC"],
    ],
  });
  return faqs;
};

export const updateFaqById = async (
  id: number,
  updates: Partial<FaqDetails>
): Promise<FaqDetails | null> => {
  const faq = await FaqModel.findByPk(id);
  if (!faq) return null;
  await faq.update(updates);
  return faq;
};

export const deleteFaqById = async (id: number): Promise<boolean> => {
  const faq = await FaqModel.findByPk(id);
  if (!faq) return false;
  await faq.update({ isActive: false });
  return true;
};
