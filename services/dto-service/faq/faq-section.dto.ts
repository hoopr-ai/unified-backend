import type { Platform } from "../constants/common.enums";

export interface CreateFaqSectionRequestData {
  platform: Platform;
  name: string;
  slug: string;
  order?: number;
}

export interface UpdateFaqSectionRequestData {
  name?: string;
  slug?: string;
  order?: number;
  isActive?: boolean;
  updatedBy?: number;
}

export interface GetFaqSectionsQueryData {
  platform: Platform;
}

export interface ReorderFaqSectionsRequestData {
  platform: Platform;
  sectionOrders: { id: number; order: number }[];
}
