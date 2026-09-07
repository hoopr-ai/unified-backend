import Joi from "joi";
import {
  METRIC_KEYS,
  METRICS,
  ORIGINS,
} from "../services/business-service/creator-analytics/modules.export";

// Every endpoint here is a read-only GET, so each schema validates a query
// string. Dates are inclusive IST calendar days (YYYY-MM-DD), defaulting to the
// last 30 days — the same convention as admin-native-analytics.validation.ts.

const dateField = Joi.string()
  .pattern(/^\d{4}-\d{2}-\d{2}$/)
  .message("dates must be YYYY-MM-DD");

const isoDay = (d: Date): string => d.toISOString().slice(0, 10);

const defaultRange = {
  startDate: dateField.default(() => isoDay(new Date(Date.now() - 29 * 86400_000))),
  endDate: dateField.default(() => isoDay(new Date())),
};

/**
 * `origin` IS validated against the enum, unlike native-analytics' pass-through
 * filters — and for the opposite reason. Those match whatever NATIVE-BE
 * happened to record, so a new OS should be filterable without a deploy. This
 * one is DERIVED by a four-arm CASE that can only ever emit these four values,
 * so anything else is a typo the caller wants to hear about rather than an
 * empty table they have to diagnose.
 */
const originFilter = Joi.string()
  .valid(...ORIGINS)
  .empty("")
  .optional();

/** funnel, funnel/timeseries, platform */
export const creatorRangeQuerySchema = Joi.object({
  ...defaultRange,
  origin: originFilter,
}).unknown(false);

/**
 * `metric` and `dimension` are the two request values in this module that reach
 * SQL as STRUCTURE rather than as binds — both are looked up in the registry's
 * fixed maps downstream, and both are checked here so an unknown one is a 400
 * rather than a silent fallback to some other metric's numbers.
 */
const metricField = Joi.string()
  .valid(...METRIC_KEYS)
  .required();

/** breakdown */
export const creatorBreakdownQuerySchema = Joi.object({
  ...defaultRange,
  origin: originFilter,
  metric: metricField,
  dimension: Joi.string().max(64).empty("").optional(),
  limit: Joi.number().integer().min(1).max(200).default(50),
}).unknown(false);

/**
 * detail + detail/export.
 *
 * `sort` is deliberately NOT validated against a per-metric list here: the
 * valid keys differ by metric, Joi cannot see which metric was chosen while
 * building the schema, and the service already falls back to the metric's
 * default on an unknown key. Rejecting here would mean maintaining the same
 * whitelist in two places, which is how the two drift.
 */
export const creatorDetailQuerySchema = Joi.object({
  ...defaultRange,
  origin: originFilter,
  metric: metricField,
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(200).default(50),
  sort: Joi.string().max(64).empty("").optional(),
  direction: Joi.string().valid("asc", "desc").default("desc"),
  search: Joi.string().max(200).empty("").optional(),
  userId: Joi.number().integer().positive().optional(),
  dimension: Joi.string().max(64).empty("").optional(),
  // Bound as a value, so it needs no vocabulary of its own — but it is capped,
  // because an unbounded string in a bind is still a string this process has to
  // hold.
  value: Joi.string().max(512).allow("").optional(),
}).unknown(false);

export const creatorEmptyQuerySchema = Joi.object({}).unknown(false);

/**
 * Overview: an OPTIONAL window, with no default.
 *
 * Deliberately not `defaultRange` like every other endpoint here. Absent dates
 * mean all-time, which is what the view is for; defaulting to 30 days would
 * silently turn "how big is the catalogue" into "how much did we add recently"
 * for anyone who did not touch the range bar.
 *
 * Both ends are required together — a lone `startDate` is a half-typed range,
 * and answering it with an open-ended window would report a number nobody
 * asked for.
 */
export const creatorOptionalRangeQuerySchema = Joi.object({
  startDate: dateField,
  endDate: dateField,
})
  .and("startDate", "endDate")
  .unknown(false);

/** Exported for the controller's 400 message on an unknown metric. */
export const KNOWN_METRICS = Object.keys(METRICS);
