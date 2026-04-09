import { FaqModel, FaqSectionModel, type FaqDetails } from "./schemas/modules.export";

export const saveFaq = async (faqDetails: FaqDetails): Promise<FaqDetails> => {
  const faq = await FaqModel.create(faqDetails);
  return faq;
};

export const findFaqById = async (id: number): Promise<FaqDetails | null> => {
  const faq = await FaqModel.findByPk(id);
  return faq;
};

export const findFaqByIdWithSection = async (
  id: number
): Promise<FaqModel | null> => {
  const faq = await FaqModel.findByPk(id, {
    include: [{ model: FaqSectionModel, as: "section" }],
  });
  return faq;
};

export const findFaqsBySectionId = async (
  sectionId: number
): Promise<FaqDetails[]> => {
  const faqs = await FaqModel.findAll({
    where: { sectionId, isActive: true },
    order: [["order", "ASC"]],
  });
  return faqs;
};

export const findFaqsByPlatformWithSections = async (
  platform: string,
  sectionId?: number
): Promise<FaqModel[]> => {
  const sectionWhere: Record<string, unknown> = { platform, isActive: true };
  if (sectionId) sectionWhere.id = sectionId;

  const faqs = await FaqModel.findAll({
    where: { isActive: true },
    include: [
      {
        model: FaqSectionModel,
        as: "section",
        where: sectionWhere,
        required: true,
      },
    ],
    order: [
      [{ model: FaqSectionModel, as: "section" }, "order", "ASC"],
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

export const bulkUpdateFaqOrders = async (
  faqOrders: { id: number; order: number }[]
): Promise<void> => {
  await Promise.all(
    faqOrders.map(({ id, order }) =>
      FaqModel.update({ order }, { where: { id } })
    )
  );
};
