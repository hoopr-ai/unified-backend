import Joi from "joi";
import type {
  DownloadTrackRequest,
  AssignTokensRequest,
} from "../services/dto-service/modules.export";

export const downloadTrackRequestSchema = Joi.object<DownloadTrackRequest>({
  trackId: Joi.string().uuid().required(),
});

export const assignTokensRequestSchema = Joi.object<AssignTokensRequest>({
  brandId: Joi.number().integer().positive().required(),
  tokens: Joi.number().integer().positive().required(),
});
