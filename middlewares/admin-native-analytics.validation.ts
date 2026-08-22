import Joi from "joi";
import { normalizePlatform } from "../services/dto-service/constants/modules.export";

// Every native-analytics endpoint is a read-only GET, so each schema validates a
// query string. Dates are IST calendar days (YYYY-MM-DD), inclusive on both
// ends, defaulting to the last 30 days — the same convention as
// admin-enterprise-analytics.validation.ts.

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

/**
 * The three dashboard filters, on every endpoint.
 *
 * Deliberately NOT `Joi.valid(...)` against the enums: the values are whatever
 * NATIVE-BE recorded, the filter dropdowns are populated from
 * GET /filter-options (which reads the data, not the constants), and a new OS
 * appearing in the wild should be filterable without a unified-backend deploy.
 * An unknown value simply matches nothing.
 *
 * `''` is coerced to undefined so the UI can clear a filter by sending an empty
 * string — otherwise "all platforms" would have to be a magic sentinel, and
 * `userPlatform=` would filter for a platform literally named "".
 *
 * `userPlatform` is still alias-normalized, though: the dashboard sends CREATOR
 * once it has shipped the rename, while the rollups NATIVE-BE writes hold
 * 'SOUND_TRACKING_APP', and an un-normalized CREATOR would silently match
 * nothing. Any other value is passed through untouched, per the above.
 */
const filters = {
  userPlatform: Joi.string()
    .max(32)
    .empty("")
    .custom((value: string) => normalizePlatform(value))
    .optional(),
  clientType: Joi.string().max(16).empty("").optional(),
  os: Joi.string().max(32).empty("").optional(),
};

/** overview, timeseries, platforms, geography, acquisition, pages, events, funnel, retention, tech */
export const nativeRangeQuerySchema = Joi.object({
  ...defaultRange,
  ...filters,
}).unknown(false);

/** GET /admin/native-analytics/sessions */
export const nativeSessionsQuerySchema = Joi.object({
  ...defaultRange,
  ...filters,
  identity: Joi.string().valid("all", "anonymous", "identified").default("all"),
  search: Joi.string().max(200).empty("").optional(),
  country: Joi.string().max(8).empty("").optional(),
  minDurationSeconds: Joi.number().integer().min(0).max(86_400).optional(),
  page: Joi.number().integer().min(1).default(1),
  // Capped at 100: each row carries device + location + acquisition, and a
  // 1000-row page is a slow query and an unreadable table.
  pageSize: Joi.number().integer().min(1).max(100).default(50),
  sortBy: Joi.string()
    .valid("startedAt", "durationSeconds", "eventCount", "pageViewCount")
    .default("startedAt"),
  sortDir: Joi.string().valid("asc", "desc").default("desc"),
}).unknown(false);

/** GET /admin/native-analytics/sessions/:id — path param, validated in the controller. */
export const nativeSessionIdSchema = Joi.object({
  id: Joi.string()
    .pattern(/^\d+$/)
    .message("session id must be numeric")
    .required(),
}).unknown(false);

/** GET /admin/native-analytics/visitors/:visitorId */
export const nativeVisitorIdSchema = Joi.object({
  visitorId: Joi.string().max(64).required(),
}).unknown(false);

/** GET /admin/native-analytics/filter-options — no parameters at all. */
export const nativeEmptyQuerySchema = Joi.object({}).unknown(false);
