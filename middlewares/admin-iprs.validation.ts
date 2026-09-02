import Joi from "joi";

// Query validation for the Smash IPRS module. Every endpoint is a read-only
// GET, so each schema validates a query string. Dates are inclusive IST
// calendar days (YYYY-MM-DD), matching the other internal dashboards.

const dateField = Joi.string()
  .pattern(/^\d{4}-\d{2}-\d{2}$/)
  .message("dates must be YYYY-MM-DD");

const dateRange = {
  startDate: dateField.required(),
  endDate: dateField.required(),
};

// Shared row filters. `none` on dealType selects licenses paid for directly,
// with no token pack behind them.
const filters = {
  brandId: Joi.number().integer().min(1).optional(),
  ownerCode: Joi.string().trim().max(255).optional(),
  dealType: Joi.string().valid("bulk", "pricePerTrack", "none").optional(),
  attribution: Joi.string()
    .valid(
      "per_track",
      "bulk_prorata",
      "direct_payment",
      "unpriced_deal",
      "bulk_unlimited",
      "unlimited_per_track",
      "no_value",
    )
    .optional(),
  iprsOnly: Joi.boolean().optional(),
  search: Joi.string().trim().max(200).allow("").optional(),
};

const pagination = {
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(200).default(25),
};

const sorting = {
  sortBy: Joi.string()
    .valid(
      "licensedAt",
      "trackName",
      "trackCode",
      "brandName",
      "ownerName",
      "gross",
      "netOfGst",
      "iprsAmount",
      "ownerAmount",
    )
    .optional(),
  sortOrder: Joi.string().valid("asc", "desc").optional(),
};

// GET /admin/iprs/overview  ·  GET /admin/iprs/trend
export const iprsOverviewQuerySchema = Joi.object({
  ...dateRange,
  ...filters,
}).unknown(false);

// GET /admin/iprs/licenses
export const iprsLicensesQuerySchema = Joi.object({
  ...dateRange,
  ...filters,
  ...pagination,
  ...sorting,
}).unknown(false);

// GET /admin/iprs/owners · /brands · /tracks
export const iprsGroupedQuerySchema = Joi.object({
  ...dateRange,
  ...filters,
  ...pagination,
}).unknown(false);

// GET /admin/iprs/deals — pack-level, so the row filters that only exist on a
// license (owner, attribution, IPRS-liability) do not apply.
export const iprsDealsQuerySchema = Joi.object({
  ...dateRange,
  brandId: filters.brandId,
  dealType: Joi.string().valid("bulk", "pricePerTrack").optional(),
  search: filters.search,
  ...pagination,
}).unknown(false);

// The export routes take the same filters but FORBID page/limit: a paged
// export is how someone downloads page 1 and forwards it as the full royalty
// statement. Omitting them here turns that into a 400 instead of a silent
// truncation.
export const iprsExportQuerySchema = Joi.object({
  ...dateRange,
  ...filters,
  ...sorting,
}).unknown(false);

export const iprsDealsExportQuerySchema = Joi.object({
  ...dateRange,
  brandId: filters.brandId,
  dealType: Joi.string().valid("bulk", "pricePerTrack").optional(),
  search: filters.search,
}).unknown(false);
