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

// GET /admin/enterprise-analytics/founder/music/track-downloaders
export const trackDownloadersQuerySchema = Joi.object({
  ...defaultRange,
  trackCode: Joi.string().max(100).required(),
}).unknown(false);

// GET /admin/enterprise-analytics/founder/brand-detail
export const brandDetailQuerySchema = Joi.object({
  brandId: Joi.number().integer().positive().required(),
}).unknown(false);

// GET /admin/enterprise-analytics/founder/music/entity-downloads
export const musicEntityQuerySchema = Joi.object({
  ...defaultRange,
  type: Joi.string().valid("artist", "genre", "language").required(),
  name: Joi.string().max(200).required(),
}).unknown(false);

// GET /admin/enterprise-analytics/founder/funnel-brands
export const funnelBrandsQuerySchema = Joi.object({
  ...defaultRange,
  scope: Joi.string().valid("adoption", "search").required(),
  stage: Joi.string().max(30).required(),
}).unknown(false);

// GET /admin/enterprise-analytics/product/query-detail
export const queryDetailQuerySchema = Joi.object({
  ...defaultRange,
  query: Joi.string().max(200).required(),
}).unknown(false);

// GET /admin/enterprise-analytics/product/feature-brands
export const featureBrandsQuerySchema = Joi.object({
  ...defaultRange,
  feature: Joi.string().valid("search", "filters", "preview", "download", "reel").required(),
}).unknown(false);

// GET /admin/enterprise-analytics/founder/brands-breakdown
export const brandsBreakdownQuerySchema = Joi.object({
  ...defaultRange,
  filter: Joi.string().valid("all", "new").default("all"),
}).unknown(false);

// GET /admin/enterprise-analytics/founder/token-breakdown
export const tokenBreakdownQuerySchema = Joi.object({
  ...defaultRange,
  metric: Joi.string().valid("issued", "spent", "reels").required(),
}).unknown(false);

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
