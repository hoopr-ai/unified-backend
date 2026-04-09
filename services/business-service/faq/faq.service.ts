import type {
  CreateFaqRequestData,
  UpdateFaqRequestData,
  GetFaqsQueryData,
  ReorderFaqsRequestData,
} from "../../dto-service/faq/faq.dto";
import {
  saveFaq,
  findFaqByIdWithSection,
  findFaqsByPlatformWithSections,
  findFaqsBySectionId,
  updateFaqById,
  deleteFaqById,
  bulkUpdateFaqOrders,
} from "../../persistence-service/faq/modules.export";
import { AppError } from "../../helper-service/modules.export";
import { ResponseMessages } from "../../dto-service/constants/response-messages";
import type { FaqModel } from "../../persistence-service/faq/schemas/faq.schema";
import type { FaqDetails } from "../../persistence-service/faq/schemas/faq.schema";

export interface FaqResponse {
  id: number;
  sectionId: number;
  section: {
    id: number;
    platform: string;
    name: string;
    slug: string;
    order: number;
  } | null;
  question: string;
  answer: string;
  order: number;
  isActive: boolean;
  createdAt: Date;
}

const toFaqResponse = (faq: FaqModel): FaqResponse => ({
  id: faq.id!,
  sectionId: faq.sectionId,
  section: faq.section
    ? {
        id: faq.section.id,
        platform: faq.section.platform,
        name: faq.section.name,
        slug: faq.section.slug,
        order: faq.section.order,
      }
    : null,
  question: faq.question,
  answer: faq.answer,
  order: faq.order,
  isActive: faq.isActive,
  createdAt: faq.createdAt,
});

const toSimpleFaqResponse = (faq: FaqDetails): Omit<FaqResponse, "section"> & { section: null } => ({
  id: faq.id!,
  sectionId: faq.sectionId,
  section: null,
  question: faq.question,
  answer: faq.answer,
  order: faq.order,
  isActive: faq.isActive,
  createdAt: faq.createdAt,
});

export const getFaqsService = async (
  query: GetFaqsQueryData
): Promise<FaqResponse[]> => {
  const faqs = await findFaqsByPlatformWithSections(query.platform, query.sectionId);
  return faqs.map(toFaqResponse);
};

export const createFaqService = async (
  data: CreateFaqRequestData
): Promise<FaqResponse> => {
  const faq = await saveFaq({
    sectionId: data.sectionId,
    question: data.question,
    answer: data.answer,
    order: data.order ?? 0,
    isActive: true,
    createdAt: new Date(),
  });

  const faqWithSection = await findFaqByIdWithSection(faq.id!);
  if (!faqWithSection) {
    return toSimpleFaqResponse(faq);
  }
  return toFaqResponse(faqWithSection);
};

export const updateFaqService = async (
  id: number,
  data: UpdateFaqRequestData
): Promise<FaqResponse> => {
  const updated = await updateFaqById(id, data);
  if (!updated) {
    throw new AppError(ResponseMessages.FaqNotFound, 404);
  }

  const faqWithSection = await findFaqByIdWithSection(id);
  if (!faqWithSection) {
    return toSimpleFaqResponse(updated);
  }
  return toFaqResponse(faqWithSection);
};

export const deleteFaqService = async (id: number): Promise<void> => {
  const deleted = await deleteFaqById(id);
  if (!deleted) {
    throw new AppError(ResponseMessages.FaqNotFound, 404);
  }
};

export const reorderFaqsService = async (
  data: ReorderFaqsRequestData
): Promise<FaqResponse[]> => {
  await bulkUpdateFaqOrders(data.faqOrders);
  const faqs = await findFaqsBySectionId(data.sectionId);
  return faqs.map(f => toSimpleFaqResponse(f));
};
