import Joi from "joi";
import {
  ALLOWLIST_PROVIDERS,
  ALLOWLIST_STATES,
} from "../services/business-service/whitelisting/allowlist.provider";
import {
  CHANNEL_SOURCES,
  CLAIM_STATUSES,
  ORIGINS,
  VIDEO_PLATFORMS,
  WHITELIST_STATUSES,
} from "../services/business-service/whitelisting/whitelisting-shared";

// Validation for the Channel Whitelisting CMS.
//
// Unlike admin-native-analytics.validation, the enum fields here ARE closed
// (`Joi.valid(...)`). The difference is that those values are observed data —
// whatever OS a browser reported — whereas these are a shared workflow
// vocabulary written by three services. A status outside the set is not a new
// value in the wild, it is a bug or an attempt to write one, and it must be
// rejected at the edge rather than stored and read back by an app that has
// never heard of it.
//
// `.empty("")` on every optional filter so the UI can clear a dropdown by
// sending `?status=` instead of needing a magic "all" sentinel.

const search = Joi.string().trim().max(255).empty("").optional();
const subscription = Joi.string().valid("active", "inactive").empty("").optional();
const origin = Joi.string().valid(...ORIGINS).empty("").optional();
const minAgeDays = Joi.number().integer().min(0).max(3650).empty("").optional();

const paging = {
  page: Joi.number().integer().min(1).default(1),
  pageSize: Joi.number().integer().min(1).max(200).default(50),
  sortDir: Joi.string().valid("asc", "desc").default("desc"),
};

export const channelListQuerySchema = Joi.object({
  status: Joi.string().valid(...WHITELIST_STATUSES).empty("").optional(),
  source: Joi.string().valid(...CHANNEL_SOURCES).empty("").optional(),
  allowlistState: Joi.string().valid(...ALLOWLIST_STATES).empty("").optional(),
  origin,
  subscription,
  search,
  minAgeDays,
  sortBy: Joi.string()
    .valid("submittedAt", "connectedAt", "audience", "subscribedAt")
    .default("submittedAt"),
  ...paging,
});

// The export shares the list's filters but has no page/pageSize of its own —
// it always returns the whole filtered set (bounded in export.service.ts). A
// paged export is a footgun: someone downloads page 1 and reports it as "the
// list", which is precisely the failure mode of the spreadsheet it replaces.
export const channelExportQuerySchema = channelListQuerySchema.fork(
  ["page", "pageSize"],
  (s) => s.forbidden(),
);

export const claimListQuerySchema = Joi.object({
  status: Joi.string().valid(...CLAIM_STATUSES).empty("").optional(),
  platform: Joi.string().valid(...VIDEO_PLATFORMS).empty("").optional(),
  origin,
  subscription,
  search,
  minAgeDays,
  sortBy: Joi.string().valid("createdAt", "updatedAt").default("createdAt"),
  ...paging,
});

export const claimExportQuerySchema = claimListQuerySchema.fork(
  ["page", "pageSize"],
  (s) => s.forbidden(),
);

// ── Bodies ──────────────────────────────────────────────────────────────────
//
// `note` is required when the status is a rejection. Enforced here as well as in
// the service so the caller gets a field-level message rather than a generic
// 400 — the service keeps its own check because it is also reachable from the
// bulk path, and a rule that only lives in the edge validator is a rule that
// gets bypassed.

const rejectionNeedsNote = (rejectValue: string) =>
  Joi.when("status", {
    is: rejectValue,
    then: Joi.string().trim().min(3).max(2000).required().messages({
      "any.required": "A reason is required when rejecting.",
      "string.min": "Give the creator a real reason — at least a few words.",
    }),
    otherwise: Joi.string().trim().max(2000).empty("").optional(),
  });

export const updateChannelBodySchema = Joi.object({
  status: Joi.string()
    .valid(...WHITELIST_STATUSES)
    .required(),
  note: rejectionNeedsNote("rejected"),
  allowlist: Joi.object({
    provider: Joi.string()
      .valid(...ALLOWLIST_PROVIDERS)
      .default("manual"),
    reference: Joi.string().trim().max(500).empty("").optional(),
  })
    .optional()
    .allow(null),
  skipNotify: Joi.boolean().default(false),
});

export const updateClaimBodySchema = Joi.object({
  status: Joi.string()
    .valid(...CLAIM_STATUSES)
    .required(),
  note: rejectionNeedsNote("REJECTED"),
  skipNotify: Joi.boolean().default(false),
});

// soundtracking_user_profiles.id is a plain int; claims.id is a bigint that
// arrives as a decimal string and must NOT be parsed into a JS number.
export const channelIdParamSchema = Joi.object({
  profileId: Joi.number().integer().min(1).required(),
});

export const claimIdParamSchema = Joi.object({
  id: Joi.string()
    .pattern(/^\d{1,20}$/)
    .required()
    .messages({ "string.pattern.base": "claim id must be numeric" }),
});
