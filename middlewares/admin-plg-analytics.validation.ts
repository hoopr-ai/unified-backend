import Joi from "joi";
import {
  ACTIONS,
  PANEL_STAGES,
  PATH_TARGETS,
  PEOPLE_SORTS,
  SEGMENT_KEYS,
  STAGE_KEYS,
  SUB_FUNNEL_KEYS,
} from "../services/business-service/creator-analytics/plg/modules.export";

// The PLG growth views. Every request value that reaches SQL as STRUCTURE — a
// stage, an action, a segment, a sub-funnel, a sort — is checked against the
// catalogue here, so an unknown one is a 400 and never an interpolation. Values
// (dates, a segment value, a search string) travel as binds.

const dateField = Joi.string()
  .pattern(/^\d{4}-\d{2}-\d{2}$/)
  .message("dates must be YYYY-MM-DD");

const IST = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Kolkata",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const istDaysAgo = (n: number): string => IST.format(new Date(Date.now() - n * 86_400_000));

/** The window, the mode and the population filters every view shares. */
const base = {
  startDate: dateField.default(() => istDaysAgo(29)),
  endDate: dateField.default(() => istDaysAgo(0)),
  mode: Joi.string().valid("cohort", "activity").default("cohort"),
  horizonDays: Joi.number().integer().min(1).max(180).default(30),
  surface: Joi.string().valid("all", "web", "app").default("all"),
  segment: Joi.string()
    .valid(...SEGMENT_KEYS)
    .empty("")
    .optional(),
  segmentValue: Joi.string().max(200).allow("").optional(),
};

/** A window of at most a year — the core reads every session in it. */
const bounded = (schema: Joi.ObjectSchema) =>
  schema
    .with("segment", "segmentValue")
    .custom((v, helpers) => {
      if (v.startDate > v.endDate) return helpers.message({ custom: "startDate must not be after endDate" });
      const days = (Date.parse(v.endDate) - Date.parse(v.startDate)) / 86_400_000;
      if (days > 366) return helpers.message({ custom: "the window may be at most one year" });
      return v;
    });

export const plgFunnelQuerySchema = bounded(
  Joi.object({
    ...base,
    compare: Joi.string()
      .valid(...SEGMENT_KEYS)
      .empty("")
      .optional(),
  }).unknown(false),
);

export const plgTrendQuerySchema = bounded(
  Joi.object({
    ...base,
    granularity: Joi.string().valid("day", "week", "month").default("day"),
  }).unknown(false),
);

export const plgStageQuerySchema = bounded(
  Joi.object({
    ...base,
    stage: Joi.string()
      .valid(...PANEL_STAGES)
      .required(),
  }).unknown(false),
);

export const plgSubFunnelQuerySchema = bounded(
  Joi.object({
    ...base,
    key: Joi.string()
      .valid(...SUB_FUNNEL_KEYS)
      .required(),
  }).unknown(false),
);

export const plgPeopleQuerySchema = bounded(
  Joi.object({
    ...base,
    stage: Joi.string()
      .valid(...STAGE_KEYS)
      .empty("")
      .optional(),
    dropped: Joi.boolean().default(false),
    action: Joi.string()
      .valid(...ACTIONS.map((a) => a.key))
      .empty("")
      .optional(),
    subFunnel: Joi.string()
      .valid(...SUB_FUNNEL_KEYS)
      .empty("")
      .optional(),
    step: Joi.number().integer().min(0).max(20).optional(),
    search: Joi.string().max(120).empty("").optional(),
    sort: Joi.string()
      .valid(...Object.keys(PEOPLE_SORTS))
      .empty("")
      .optional(),
    order: Joi.string().valid("asc", "desc").default("desc"),
    page: Joi.number().integer().min(1).max(10_000).default(1),
    pageSize: Joi.number().integer().min(1).max(100).default(25),
  }).unknown(false),
);

export const plgPathsQuerySchema = bounded(
  Joi.object({
    ...base,
    target: Joi.string()
      .valid(...Object.keys(PATH_TARGETS))
      .default("subscribed"),
    limit: Joi.number().integer().min(1).max(50).default(15),
  }).unknown(false),
);

export const plgInsightsQuerySchema = bounded(Joi.object({ ...base }).unknown(false));

export const plgJourneyQuerySchema = Joi.object({
  person: Joi.string().trim().min(1).max(160).required(),
}).unknown(false);

export const plgRetentionQuerySchema = Joi.object({
  startDate: dateField.default("2026-08-17"),
  endDate: dateField.default(() => istDaysAgo(0)),
  surface: Joi.string().valid("all", "web", "app").default("all"),
  activationDays: Joi.number().integer().min(1).max(60).default(7),
}).unknown(false);

export const plgAuditQuerySchema = Joi.object({
  days: Joi.number().integer().min(1).max(90).default(7),
}).unknown(false);

export const plgEmptyQuerySchema = Joi.object({}).unknown(false);
