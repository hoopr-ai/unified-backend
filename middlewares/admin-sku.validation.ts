import Joi from "joi";

// Shared price/usage value fields. All optional — only the supplied ones are
// written (upsert keeps the rest unchanged / at defaults on create).
const priceField = Joi.number().min(0).max(10_000_000);

const skuValuesSchema = {
  costPrice: priceField.allow(null).optional(),
  sellingPrice: priceField.allow(null).optional(),
  gstPercent: Joi.number().min(0).max(100).allow(null).optional(),
  maxUsage: Joi.number().integer().min(1).max(100000).allow(null).optional(),
  description: Joi.string().trim().max(255).allow("", null).optional(),
};

// At least one value must be present, else the request is a no-op.
const requireAtLeastOneValue = (obj: Joi.ObjectSchema) =>
  obj.or("costPrice", "sellingPrice", "gstPercent", "maxUsage", "description");

// Selling price can never exceed cost price. Only checked when both are
// supplied in the same payload — a request that only touches one of the two
// is validated against the other's existing DB value at the service layer
// instead (see sku.persistence.service.ts), since Joi only sees this request.
const enforcePriceOrder = (obj: Joi.ObjectSchema) =>
  obj.custom((value: { costPrice?: number | null; sellingPrice?: number | null }, helpers) => {
    const { costPrice, sellingPrice } = value;
    if (
      costPrice !== undefined &&
      costPrice !== null &&
      sellingPrice !== undefined &&
      sellingPrice !== null &&
      sellingPrice > costPrice
    ) {
      return helpers.error("sku.sellingPriceExceedsCost");
    }
    return value;
  }).messages({
    "sku.sellingPriceExceedsCost":
      "Selling price must be less than or equal to cost price.",
  });

// GET /admin/skus
export const listSkusQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(25),
  search: Joi.string().trim().allow("").optional(),
  ownerId: Joi.string().uuid().optional(),
  tier: Joi.string().trim().optional(),
  status: Joi.string().trim().optional(),
  vocals: Joi.string().valid("vocal", "instrumental", "unknown").optional(),
  // Comma-separated artist ids (GET query). Parsed to an array in the service.
  artistIds: Joi.string().trim().optional(),
  hasSku: Joi.boolean().optional(),
}).unknown(false);

// GET /admin/skus/artists?search=
export const artistSearchQuerySchema = Joi.object({
  search: Joi.string().trim().allow("").optional(),
  limit: Joi.number().integer().min(1).max(50).default(20),
}).unknown(false);

// PUT /admin/skus/:trackCode
export const upsertSkuSchema = enforcePriceOrder(
  requireAtLeastOneValue(Joi.object(skuValuesSchema)),
).unknown(false);

// POST /admin/skus/bulk — exactly one of trackCodes / filter.
export const bulkUpsertSkuSchema = Joi.object({
  trackCodes: Joi.array()
    .items(Joi.string().trim().min(1))
    .unique()
    .min(1)
    .max(5000)
    .optional(),
  filter: Joi.object({
    ownerId: Joi.string().uuid().optional(),
    tier: Joi.string().trim().optional(),
    status: Joi.string().trim().optional(),
    vocals: Joi.string().valid("vocal", "instrumental", "unknown").optional(),
    artistIds: Joi.array().items(Joi.string().uuid()).single().optional(),
    search: Joi.string().trim().allow("").optional(),
    onlyMissingSku: Joi.boolean().optional(),
  })
    .min(1)
    .optional(),
  values: enforcePriceOrder(
    requireAtLeastOneValue(Joi.object(skuValuesSchema)),
  ).required(),
})
  .xor("trackCodes", "filter")
  .unknown(false)
  .messages({
    "object.xor": "Provide exactly one of trackCodes or filter.",
    "object.missing": "Provide exactly one of trackCodes or filter.",
  });
