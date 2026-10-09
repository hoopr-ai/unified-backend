import Joi from "joi";

// Every message here is shown to the visitor verbatim — the landing page toasts
// error.message as-is — so they are written for a person, not a developer.

const MODES = ["explore", "brief", "reco"] as const;

// Free text from a public form. Blank is allowed through and dropped later:
// the FE omits empty fields, but an older build or a hand-made request may not.
const text = (max: number, label: string) =>
  Joi.string()
    .trim()
    .allow("")
    .max(max)
    .messages({
      "string.base": `${label} must be text.`,
      "string.max": `${label} is too long (max ${max} characters).`,
    });

const list = (maxItems: number, label: string) =>
  Joi.array()
    .items(Joi.string().trim().max(100))
    .max(maxItems)
    .messages({
      "array.base": `${label} must be a list.`,
      "array.max": `Please pick at most ${maxItems} ${label.toLowerCase()}.`,
      "string.base": `${label} must be text.`,
      "string.max": `One of the ${label.toLowerCase()} is too long.`,
    });

export const smashPlusBriefSchema = Joi.object({
  mode: Joi.string()
    .valid(...MODES)
    .required()
    .messages({
      "any.required": "Something went wrong with the form. Please refresh and try again.",
      "any.only": "Something went wrong with the form. Please refresh and try again.",
      "string.base": "Something went wrong with the form. Please refresh and try again.",
    }),
  name: Joi.string().trim().min(1).max(255).required().messages({
    "any.required": "Please enter your name.",
    "string.empty": "Please enter your name.",
    "string.base": "Please enter your name.",
    "string.max": "Name is too long.",
  }),
  company: Joi.string().trim().min(1).max(255).required().messages({
    "any.required": "Please enter your company.",
    "string.empty": "Please enter your company.",
    "string.base": "Please enter your company.",
    "string.max": "Company name is too long.",
  }),
  email: Joi.string()
    .trim()
    .lowercase()
    .max(255)
    .email({ tlds: { allow: false } })
    .required()
    .messages({
      "any.required": "Please enter your email.",
      "string.empty": "Please enter your email.",
      "string.base": "Please enter a valid email address.",
      "string.email": "Please enter a valid email address.",
      "string.max": "Email is too long.",
    }),
  placements: list(20, "Placements").default([]),

  question: text(2000, "Your question"),
  song: text(500, "Song"),
  exclusivity: text(100, "Exclusivity"),
  budget: text(255, "Budget"),
  moods: list(20, "Moods"),
  reference: text(2000, "Reference"),

  // Mandatory on the FE for brief + reco only; never asked in explore.
  term: Joi.when("mode", {
    is: Joi.valid("brief", "reco"),
    then: Joi.string().trim().min(1).max(100).required(),
    otherwise: Joi.any(),
  }).messages({
    "any.required": "Please select a term.",
    "string.empty": "Please select a term.",
    "string.base": "Please select a term.",
    "string.max": "Term is too long.",
  }),
  territory: text(255, "Territory"),
  goLiveDate: Joi.string()
    .trim()
    .allow("")
    .pattern(/^\d{4}-\d{2}-\d{2}$/)
    .custom((value: string, helpers) => {
      if (value === "") return value;
      const d = new Date(`${value}T00:00:00Z`);
      // Rejects 2026-02-30 and friends, which pass the pattern.
      if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value) {
        return helpers.error("string.pattern.base");
      }
      return value;
    })
    .messages({
      "string.base": "Please pick a valid go-live date.",
      "string.pattern.base": "Please pick a valid go-live date.",
    }),
}).prefs({ abortEarly: true, stripUnknown: true, convert: true });
