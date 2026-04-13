import type { Platform } from "../constants/common.enums";

export interface CreateFaqRequestData {
  sectionId: number;
  question: string;
  answer: string;
  order?: number;
}

export interface UpdateFaqRequestData {
  sectionId?: number;
  question?: string;
  answer?: string;
  order?: number;
  isActive?: boolean;
  updatedBy?: number;
}

export interface GetFaqsQueryData {
  platform: Platform;
  sectionId?: number;
}

export interface ReorderFaqsRequestData {
  sectionId: number;
  faqOrders: { id: number; order: number }[];
}
