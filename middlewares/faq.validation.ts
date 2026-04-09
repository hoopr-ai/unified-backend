import Joi from "joi";
import { Platform } from "../services/dto-service/constants/common.enums";
import type {
  CreateFaqRequestData,
  UpdateFaqRequestData,
  GetFaqsQueryData,
  ReorderFaqsRequestData,
} from "../services/dto-service/faq/faq.dto";

const platformValues = Object.values(Platform) as string[];

export const getFaqsQuerySchema = Joi.object<GetFaqsQueryData>({
  platform: Joi.string().valid(...platformValues).required(),
  sectionId: Joi.number().integer().positive().optional(),
});

export const createFaqRequestSchema = Joi.object<CreateFaqRequestData>({
  sectionId: Joi.number().integer().positive().required(),
  question: Joi.string().min(5).max(1000).required(),
  answer: Joi.string().min(5).required(),
  order: Joi.number().integer().min(0).optional(),
});

export const updateFaqRequestSchema = Joi.object<UpdateFaqRequestData>({
  sectionId: Joi.number().integer().positive().optional(),
  question: Joi.string().min(5).max(1000).optional(),
  answer: Joi.string().min(5).optional(),
  order: Joi.number().integer().min(0).optional(),
  isActive: Joi.boolean().optional(),
});

export const reorderFaqsRequestSchema = Joi.object<ReorderFaqsRequestData>({
  sectionId: Joi.number().integer().positive().required(),
  faqOrders: Joi.array()
    .items(
      Joi.object({
        id: Joi.number().integer().positive().required(),
        order: Joi.number().integer().min(0).required(),
      })
    )
    .min(1)
    .required(),
});
