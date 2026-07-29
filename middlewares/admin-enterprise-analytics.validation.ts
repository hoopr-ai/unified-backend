import Joi from "joi";

// All enterprise-analytics endpoints are read-only GETs; every schema
// validates a query string. Dates arrive as IST calendar days (YYYY-MM-DD),
// inclusive on both ends, defaulting to the last 30 days when omitted.

const dateField = Joi.string()
  .pattern(/^\d{4}-\d{2}-\d{2}$/)
  .message("dates must be YYYY-MM-DD");

const isoDay = (d: Date): string => d.toISOString().slice(0, 10);

const defaultRange = {
  startDate: dateField.default(() =>
    isoDay(new Date(Date.now() - 29 * 86400_000)),
  ),
  endDate: dateField.default(() => isoDay(new Date())),
};

export const rangeQuerySchema = Joi.object({ ...defaultRange }).unknown(false);

// GET /admin/enterprise-analytics/cs/accounts
export const csAccountsQuerySchema = Joi.object({
  search: Joi.string().max(100).optional(),
  healthTier: Joi.string().valid("HEALTHY", "MODERATE", "AT_RISK").optional(),
}).unknown(false);

// GET /admin/enterprise-analytics/cs/token-accounts
export const csTokenAccountsQuerySchema = Joi.object({
  search: Joi.string().max(100).optional(),
  packStatus: Joi.string().valid("ACTIVE", "EXPIRED").optional(),
}).unknown(false);

// GET /admin/enterprise-analytics/leads
export const leadsQuerySchema = Joi.object({
  search: Joi.string().max(100).optional(),
}).unknown(false);

// GET endpoints with no parameters (funnel, retention, alerts).
export const emptyQuerySchema = Joi.object({}).unknown(false);
