import Joi from "joi";

export const getTracksByCodesRequestSchema = Joi.object({
  trackCodes: Joi.array().items(Joi.string()).min(1).required(),
});
