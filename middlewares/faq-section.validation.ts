import Joi from "joi";
import { platformField } from "./platform.validation";
import type {
  CreateFaqSectionRequestData,
  UpdateFaqSectionRequestData,
  GetFaqSectionsQueryData,
  ReorderFaqSectionsRequestData,
} from "../services/dto-service/faq/faq-section.dto";

export const getFaqSectionsQuerySchema = Joi.object<GetFaqSectionsQueryData>({
  platform: platformField.required(),
});

export const createFaqSectionRequestSchema = Joi.object<CreateFaqSectionRequestData>({
  platform: platformField.required(),
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
  platform: platformField.required(),
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
