import Joi from "joi";
import type {
  LicenseTrackRequest,
  AssignTokensRequest,
} from "../services/dto-service/modules.export";

export const licenseTrackRequestSchema = Joi.object<LicenseTrackRequest>({
  trackId: Joi.string().uuid().required(),
});

export const assignTokensRequestSchema = Joi.object<AssignTokensRequest>({
  brandId: Joi.number().integer().positive().required(),
  tokens: Joi.number().integer().positive().required(),
});
