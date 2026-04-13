import type {
  CreateFaqSectionRequestData,
  UpdateFaqSectionRequestData,
  GetFaqSectionsQueryData,
  ReorderFaqSectionsRequestData,
} from "../../dto-service/faq/faq-section.dto";
import {
  saveFaqSection,
  findFaqSectionById,
  findFaqSectionsByPlatform,
  updateFaqSectionById,
  deleteFaqSectionById,
  bulkUpdateFaqSectionOrders,
} from "../../persistence-service/faq/modules.export";
import { AppError } from "../../helper-service/modules.export";
import { ResponseMessages } from "../../dto-service/constants/response-messages";
import type { FaqSectionDetails } from "../../persistence-service/faq/schemas/faq-section.schema";

export interface FaqSectionResponse {
  id: number;
  platform: string;
  name: string;
  slug: string;
  order: number;
  isActive: boolean;
  updatedBy?: number;
  createdAt: Date;
}

const toFaqSectionResponse = (section: FaqSectionDetails): FaqSectionResponse => ({
  id: section.id!,
  platform: section.platform,
  name: section.name,
  slug: section.slug,
  order: section.order,
  isActive: section.isActive,
  updatedBy: section.updatedBy,
  createdAt: section.createdAt,
});

export const getFaqSectionsService = async (
  query: GetFaqSectionsQueryData
): Promise<FaqSectionResponse[]> => {
  const sections = await findFaqSectionsByPlatform(query.platform);
  return sections.map(toFaqSectionResponse);
};

export const createFaqSectionService = async (
  data: CreateFaqSectionRequestData
): Promise<FaqSectionResponse> => {
  const section = await saveFaqSection({
    platform: data.platform,
    name: data.name,
    slug: data.slug,
    order: data.order ?? 0,
    isActive: true,
    createdAt: new Date(),
  });
  return toFaqSectionResponse(section);
};

export const updateFaqSectionService = async (
  id: number,
  data: UpdateFaqSectionRequestData,
  userId?: number
): Promise<FaqSectionResponse> => {
  const updated = await updateFaqSectionById(id, { ...data, updatedBy: userId });
  if (!updated) {
    throw new AppError(ResponseMessages.FaqSectionNotFound, 404);
  }
  return toFaqSectionResponse(updated);
};

export const deleteFaqSectionService = async (id: number): Promise<void> => {
  const deleted = await deleteFaqSectionById(id);
  if (!deleted) {
    throw new AppError(ResponseMessages.FaqSectionNotFound, 404);
  }
};

export const reorderFaqSectionsService = async (
  data: ReorderFaqSectionsRequestData
): Promise<FaqSectionResponse[]> => {
  await bulkUpdateFaqSectionOrders(data.sectionOrders);
  const sections = await findFaqSectionsByPlatform(data.platform);
  return sections.map(toFaqSectionResponse);
};
