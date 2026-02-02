import Joi from "joi";
import type {
  LicenseTrackRequest,
  AssignTokensRequest,
  CreateLicenseTypeRequest,
  UpdateLicenseTypeRequest,
} from "../services/dto-service/modules.export";

export const licenseTrackRequestSchema = Joi.object<LicenseTrackRequest>({
  trackId: Joi.string().uuid().required(),
});

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

export const updateLicenseTypeRequestSchema = Joi.object<UpdateLicenseTypeRequest>({
  name: Joi.string().max(255).optional(),
  type: Joi.string().valid(...licenseTypeEnumValues).optional(),
  template: Joi.string().allow("", null).optional(),
  template_buisness: Joi.string().allow("", null).optional(),
  price: Joi.number().integer().min(0).optional(),
  discontinued: Joi.boolean().optional(),
}).min(1);
