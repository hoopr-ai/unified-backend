import Joi from "joi";

// All pay-per-track analytics endpoints are read-only GETs; every schema here
// validates a query string. Dates arrive as IST calendar days (YYYY-MM-DD) and
// are inclusive on both ends.

const dateField = Joi.string()
  .pattern(/^\d{4}-\d{2}-\d{2}$/)
  .message("dates must be YYYY-MM-DD");

// Optional platform scope. Omitted = all customer platforms (INTERNAL staff
// accounts are always excluded server-side).
const platformField = Joi.string()
  .valid("SOUND_TRACKING_APP", "ENTERPRISE", "STUDIO")
  .optional();

const dateRange = {
  startDate: dateField.required(),
  endDate: dateField.required(),
  platform: platformField,
};

const pagination = {
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(25),
};

// GET /admin/pay-per-track/overview
export const overviewQuerySchema = Joi.object({ ...dateRange }).unknown(false);

// GET /admin/pay-per-track/signups/summary
export const signupsSummaryQuerySchema = Joi.object({ ...dateRange }).unknown(
  false,
);

// GET /admin/pay-per-track/signups
export const signupsListQuerySchema = Joi.object({
  ...dateRange,
  ...pagination,
  source: Joi.string().valid("direct", "team_invited", "internal").optional(),
  search: Joi.string().trim().allow("").max(255).optional(),
}).unknown(false);

// GET /admin/pay-per-track/carts/summary
export const cartsSummaryQuerySchema = Joi.object({ ...dateRange }).unknown(
  false,
);

// GET /admin/pay-per-track/carts — current cart contents (snapshot, so the
// date range is not required here).
export const cartsListQuerySchema = Joi.object({
  ...pagination,
  platform: platformField,
  cartType: Joi.string().valid("B", "C").optional(),
  abandoned: Joi.boolean().optional(),
  search: Joi.string().trim().allow("").max(255).optional(),
}).unknown(false);

// GET /admin/pay-per-track/orders
export const ordersListQuerySchema = Joi.object({
  ...dateRange,
  ...pagination,
  status: Joi.string().valid("PENDING", "SUCCESS", "FAILED").optional(),
  search: Joi.string().trim().allow("").max(255).optional(),
}).unknown(false);

// GET /admin/pay-per-track/transactions/summary
export const transactionsSummaryQuerySchema = Joi.object({
  ...dateRange,
}).unknown(false);

// GET /admin/pay-per-track/transactions
export const transactionsListQuerySchema = Joi.object({
  ...dateRange,
  ...pagination,
  status: Joi.string().valid("I", "S", "F").optional(),
  paymentMethod: Joi.string().trim().max(50).optional(),
  search: Joi.string().trim().allow("").max(255).optional(),
}).unknown(false);

// GET /admin/pay-per-track/funnel
export const funnelQuerySchema = Joi.object({ ...dateRange }).unknown(false);

// GET /admin/pay-per-track/funnel/dropped — users who reached `stage` inside
// the range but never reached the next stage.
export const funnelDroppedQuerySchema = Joi.object({
  ...dateRange,
  ...pagination,
  stage: Joi.string()
    .valid("signup", "streamed", "cart", "checkout", "payment")
    .required(),
}).unknown(false);

// GET /admin/pay-per-track/engagement/summary
export const engagementSummaryQuerySchema = Joi.object({
  ...dateRange,
}).unknown(false);

// GET /admin/pay-per-track/users/:id/activity
export const userActivityQuerySchema = Joi.object({
  ...pagination,
}).unknown(false);

// GET /admin/pay-per-track/tracks/top
export const topTracksQuerySchema = Joi.object({
  ...dateRange,
  limit: Joi.number().integer().min(1).max(100).default(25),
  by: Joi.string().valid("revenue", "units").default("revenue"),
}).unknown(false);

// GET /admin/pay-per-track/customers/summary
export const customersSummaryQuerySchema = Joi.object({
  ...dateRange,
}).unknown(false);

// GET /admin/pay-per-track/customers
export const customersListQuerySchema = Joi.object({
  ...dateRange,
  ...pagination,
  search: Joi.string().trim().allow("").max(255).optional(),
  sort: Joi.string()
    .valid("totalSpend", "ordersCount", "lastPurchaseAt")
    .default("totalSpend"),
}).unknown(false);
