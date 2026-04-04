import Joi from "joi";
import { Platform } from "../services/dto-service/constants/common.enums";
import type {
  CreateFaqSectionRequestData,
  UpdateFaqSectionRequestData,
  GetFaqSectionsQueryData,
  ReorderFaqSectionsRequestData,
} from "../services/dto-service/faq/faq-section.dto";

const platformValues = Object.values(Platform) as string[];

export const getFaqSectionsQuerySchema = Joi.object<GetFaqSectionsQueryData>({
  platform: Joi.string().valid(...platformValues).required(),
});

export const createFaqSectionRequestSchema = Joi.object<CreateFaqSectionRequestData>({
  platform: Joi.string().valid(...platformValues).required(),
  name: Joi.string().min(1).max(255).required(),
  slug: Joi.string().min(1).max(255).required(),
  order: Joi.number().integer().min(0).optional(),
});

export const updateFaqSectionRequestSchema = Joi.object<UpdateFaqSectionRequestData>({
  name: Joi.string().min(1).max(255).optional(),
  slug: Joi.string().min(1).max(255).optional(),
  order: Joi.number().integer().min(0).optional(),
  isActive: Joi.boolean().optional(),
});

export const reorderFaqSectionsRequestSchema = Joi.object<ReorderFaqSectionsRequestData>({
  platform: Joi.string().valid(...platformValues).required(),
  sectionOrders: Joi.array()
    .items(
      Joi.object({
        id: Joi.number().integer().positive().required(),
        order: Joi.number().integer().min(0).required(),
      })
    )
    .min(1)
    .required(),
});
