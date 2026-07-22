import Joi from "joi";

const ALLOWED_ROLES = ["admin", "sales", "marketing", "music", "songfest"];

// Per-user functionality grant. Optional on create (defaults to []); for an
// admin role the FE may omit it entirely (admins get everything by role).
// Ids are NOT checked against a fixed catalog — internal-fe owns the catalog and
// whatever it sends is accepted (each CMS endpoint enforces its own auth, so an
// unknown id unlocks nothing). We only require non-empty, de-duplicated strings.
const functionalitiesField = Joi.array()
  .items(Joi.string().trim().min(1))
  .unique();

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
  functionalities: functionalitiesField.optional(),
}).unknown(false);

// PATCH /admin/internal-users/:id/functionalities — replaces the user's grant
// list wholesale. Empty array is valid (revokes everything).
export const updateInternalUserFunctionalitiesSchema = Joi.object({
  functionalities: functionalitiesField.required(),
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
