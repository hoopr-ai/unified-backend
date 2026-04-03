import type {
  CreateFaqRequestData,
  UpdateFaqRequestData,
  GetFaqsQueryData,
} from "../../dto-service/faq/faq.dto";
import {
  saveFaq,
  findFaqById,
  findFaqsByPlatform,
  updateFaqById,
  deleteFaqById,
} from "../../persistence-service/faq/modules.export";
import { AppError } from "../../helper-service/modules.export";
import { ResponseMessages } from "../../dto-service/constants/response-messages";
import type { FaqDetails } from "../../persistence-service/faq/schemas/faq.schema";

export interface FaqResponse {
  id: number;
  platform: string;
  section: string;
  question: string;
  answer: string;
  order: number;
  isActive: boolean;
  createdAt: Date;
}

const toFaqResponse = (faq: FaqDetails): FaqResponse => ({
  id: faq.id!,
  platform: faq.platform,
  section: faq.section,
  question: faq.question,
  answer: faq.answer,
  order: faq.order,
  isActive: faq.isActive,
  createdAt: faq.createdAt,
});

export const getFaqsService = async (
  query: GetFaqsQueryData
): Promise<FaqResponse[]> => {
  const faqs = await findFaqsByPlatform(query.platform, query.section);
  return faqs.map(toFaqResponse);
};

export const createFaqService = async (
  data: CreateFaqRequestData
): Promise<FaqResponse> => {
  const faq = await saveFaq({
    platform: data.platform,
    section: data.section,
    question: data.question,
    answer: data.answer,
    order: data.order ?? 0,
    isActive: true,
    createdAt: new Date(),
  });
  return toFaqResponse(faq);
};

export const updateFaqService = async (
  id: number,
  data: UpdateFaqRequestData
): Promise<FaqResponse> => {
  const updated = await updateFaqById(id, data);
  if (!updated) {
    throw new AppError(ResponseMessages.FaqNotFound, 404);
  }
  return toFaqResponse(updated);
};

export const deleteFaqService = async (id: number): Promise<void> => {
  const deleted = await deleteFaqById(id);
  if (!deleted) {
    throw new AppError(ResponseMessages.FaqNotFound, 404);
  }
};
