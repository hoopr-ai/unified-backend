import Joi from "joi";
import type {
  AssignTokensRequest,
  CreateLicenseTypeRequest,
} from "../services/dto-service/modules.export";

export const assignTokensRequestSchema = Joi.object<AssignTokensRequest>({
  brandId: Joi.number().integer().positive().required(),
  tokens: Joi.number().integer().positive().required(),
});

const licenseTypeEnumValues = ["standard", "premium", "enterprise"];

export const createLicenseTypeRequestSchema = Joi.object<CreateLicenseTypeRequest>({
  name: Joi.string().max(255).required(),
  type: Joi.string().valid(...licenseTypeEnumValues).required(),
  template: Joi.string().allow("", null).optional(),
  template_buisness: Joi.string().allow("", null).optional(),
  price: Joi.number().integer().min(0).required(),
});
