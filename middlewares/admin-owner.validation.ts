import Joi from "joi";

// GET /admin/owners — paginated + optional search over ownerCode / username.
export const listOwnersQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(25),
  search: Joi.string().trim().allow("").optional(),
}).unknown(false);

// Each usage-info list is a bounded array of non-empty trimmed strings. Empty
// arrays are allowed (a field can be cleared); items are de-duplicated.
const stringList = Joi.array()
  .items(Joi.string().trim().min(1).max(500))
  .max(100)
  .default([]);

// PUT /admin/owners/:id/usage-info — the full blob is always sent (the editor
// posts every field), so all lists are required (may be empty) and the
// clearance text is optional. `.default([])` fills any omitted list.
export const updateUsageInfoSchema = Joi.object({
  allowed: stringList,
  notAllowed: stringList,
  allowedPlatforms: stringList,
  clearanceSummary: stringList,
  addYourLinksForClearance: Joi.string().trim().allow("").max(5000).optional(),
}).unknown(false);
