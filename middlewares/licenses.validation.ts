import Joi from "joi";
import type {
  AssignTokensRequest,
  CreateLicenseTypeRequest,
} from "../services/dto-service/modules.export";

export const assignTokensRequestSchema = Joi.object<AssignTokensRequest>({
  brandId: Joi.number().integer().positive().required(),
  tokens: Joi.number().integer().positive().required(),
  type: Joi.string().trim().min(1).required(),
  expiryDate: Joi.date().optional(),
  ownerIds: Joi.array().items(Joi.string()).optional(),
  // Deal header — see token.validation.ts. Optional so pre-existing
  // allocations keep assigning unchanged.
  startDate: Joi.date().optional().allow(null),
  title: Joi.string().trim().max(255).optional().allow(null, ""),
  subTitle: Joi.string().trim().max(500).optional().allow(null, ""),
});

const licenseTypeEnumValues = ["standard", "premium", "enterprise"];

export const createLicenseTypeRequestSchema = Joi.object<CreateLicenseTypeRequest>({
  name: Joi.string().max(255).required(),
  type: Joi.string().valid(...licenseTypeEnumValues).required(),
  template: Joi.string().allow("", null).optional(),
  template_buisness: Joi.string().allow("", null).optional(),
  price: Joi.number().integer().min(0).required(),
});
