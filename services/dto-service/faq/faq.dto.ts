import type { FaqSection } from "./faq.enum";
import type { Platform } from "../constants/common.enums";

export interface CreateFaqRequestData {
  platform: Platform;
  section: FaqSection;
  question: string;
  answer: string;
  order?: number;
}

export interface UpdateFaqRequestData {
  platform?: Platform;
  section?: FaqSection;
  question?: string;
  answer?: string;
  order?: number;
  isActive?: boolean;
}

export interface GetFaqsQueryData {
  platform: Platform;
  section?: FaqSection;
}
