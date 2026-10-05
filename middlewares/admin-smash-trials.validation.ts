import Joi from "joi";

// GET /admin/smash-trials — `search` matches the company email domain.
export const listTrialsQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  search: Joi.string().trim().max(255).optional(),
});

export const trialBrandIdParamSchema = Joi.object({
  brandId: Joi.number().integer().positive().required(),
});

// GET /admin/smash-trials/funnel — trials STARTED in [from, to). Defaults to
// the last 30 days.
export const trialFunnelQuerySchema = Joi.object({
  from: Joi.date().iso().optional(),
  to: Joi.date().iso().optional(),
});
