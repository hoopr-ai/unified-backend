import Joi from "joi";

const ALLOWED_ROLES = ["admin", "sales", "marketing", "music", "songfest"];

// Loose mobile validator — accepts E.164-ish (+ optional, then 8-15 digits).
// We don't try to be a full phone-parsing library, just reject obvious garbage.
const mobilePattern = /^\+?\d{8,15}$/;

export const createInternalUserSchema = Joi.object({
  firstName: Joi.string().trim().min(1).max(255).required(),
  lastName: Joi.string().trim().min(1).max(255).required(),
  email: Joi.string().email().required(),
  mobile: Joi.string()
    .trim()
    .pattern(mobilePattern)
    .allow("", null)
    .optional()
    .messages({
      "string.pattern.base":
        "mobile must be 8-15 digits, optionally prefixed with '+'",
    }),
  role: Joi.string()
    .valid(...ALLOWED_ROLES)
    .required(),
}).unknown(false);

export const listInternalUsersQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(25),
  search: Joi.string().trim().allow("").optional(),
  role: Joi.string()
    .valid(...ALLOWED_ROLES)
    .optional(),
}).unknown(false);

export { ALLOWED_ROLES };
