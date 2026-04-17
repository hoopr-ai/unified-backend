import Joi from "joi";

export interface LookupCompanyRequestData {
  companyName: string;
}

export const lookupCompanyRequestSchema = Joi.object<LookupCompanyRequestData>({
  companyName: Joi.string().min(1).max(500).required().messages({
    "any.required": "companyName is required",
    "string.empty": "companyName is required",
    "string.min": "companyName must be at least 1 character",
    "string.max": "companyName must be at most 500 characters",
  }),
}).unknown(false);
