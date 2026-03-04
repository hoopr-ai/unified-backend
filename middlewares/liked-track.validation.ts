import Joi from "joi";
import type { LikeTrackRequestData } from "../services/dto-service/modules.export";

export const likeTrackRequestSchema = Joi.object<LikeTrackRequestData>({
  trackCode: Joi.string().required(),
});
