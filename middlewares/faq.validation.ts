import Joi from "joi";
import { Platform } from "../services/dto-service/constants/common.enums";
import { FaqSection } from "../services/dto-service/faq/faq.enum";
import type {
  CreateFaqRequestData,
  UpdateFaqRequestData,
  GetFaqsQueryData,
} from "../services/dto-service/faq/faq.dto";

const platformValues = Object.values(Platform) as string[];
const sectionValues = Object.values(FaqSection) as string[];

export const getFaqsQuerySchema = Joi.object<GetFaqsQueryData>({
  platform: Joi.string().valid(...platformValues).required(),
  section: Joi.string().valid(...sectionValues).optional(),
});

export const createFaqRequestSchema = Joi.object<CreateFaqRequestData>({
  platform: Joi.string().valid(...platformValues).required(),
  section: Joi.string().valid(...sectionValues).required(),
  question: Joi.string().min(5).max(1000).required(),
  answer: Joi.string().min(5).required(),
  order: Joi.number().integer().min(0).optional(),
});

export const updateFaqRequestSchema = Joi.object<UpdateFaqRequestData>({
  platform: Joi.string().valid(...platformValues).optional(),
  section: Joi.string().valid(...sectionValues).optional(),
  question: Joi.string().min(5).max(1000).optional(),
  answer: Joi.string().min(5).optional(),
  order: Joi.number().integer().min(0).optional(),
  isActive: Joi.boolean().optional(),
});
