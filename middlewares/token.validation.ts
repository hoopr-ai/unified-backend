import Joi from "joi";
import type {
  AssignTokensRequest,
  DeductTokensRequest,
  SetTokenAssignedPriceRequest,
} from "../services/dto-service/modules.export";

export const assignTokensRequestSchema = Joi.object<AssignTokensRequest>({
  brandId: Joi.number().integer().positive().required().messages({
    "any.required": "brandId is required",
    "number.positive": "brandId must be a positive number",
  }),
  isUnlimited: Joi.boolean().optional().default(false),
  tokens: Joi.when("isUnlimited", {
    is: true,
    then: Joi.forbidden().messages({
      "any.unknown": "tokens cannot be set when isUnlimited is true",
    }),
    otherwise: Joi.number().integer().positive().required().messages({
      "any.required": "tokens is required",
      "number.positive": "tokens must be a positive number",
    }),
  }),
  type: Joi.string().trim().min(1).max(255).required().messages({
    "any.required": "type is required",
    "string.empty": "type cannot be empty",
  }),
  expiryDate: Joi.date().optional().messages({
    "date.base": "expiryDate must be a valid date",
  }),
  ownerIds: Joi.array().items(Joi.string()).optional(),
  // Unlimited allocations are always bulk-only (Pack + IPRS + Hoopr); the
  // per-track shape doesn't fit because there's no token count to multiply by.
  dealType: Joi.when("isUnlimited", {
    is: true,
    then: Joi.string().valid("bulk").required().messages({
      "any.required": "dealType is required",
      "any.only": "dealType must be 'bulk' when isUnlimited is true",
    }),
    otherwise: Joi.string().valid("bulk", "pricePerTrack").optional().messages({
      "any.only": "dealType must be either 'bulk' or 'pricePerTrack'",
    }),
  }),
  pricePerPack: Joi.when("isUnlimited", {
    is: true,
    then: Joi.number().positive().precision(2).required().messages({
      "any.required": "pricePerPack is required",
      "number.positive": "pricePerPack must be a positive number",
    }),
    otherwise: Joi.number().positive().precision(2).optional().messages({
      "number.positive": "pricePerPack must be a positive number",
    }),
  }),
  iprsShare: Joi.when("dealType", {
    is: "bulk",
    then: Joi.number().min(0).precision(2).required().messages({
      "any.required": "iprsShare is required when dealType is bulk",
      "number.min": "iprsShare must be a non-negative number",
    }),
    otherwise: Joi.forbidden(),
  }),
  hooprShare: Joi.when("dealType", {
    is: "bulk",
    then: Joi.number().min(0).precision(2).required().messages({
      "any.required": "hooprShare is required when dealType is bulk",
      "number.min": "hooprShare must be a non-negative number",
    }),
    otherwise: Joi.forbidden(),
  }),
  keyName: Joi.string().trim().max(255).allow(null, "").optional().messages({
    "string.max": "keyName must be at most 255 characters",
  }),
});

export const setTokenAssignedPriceSchema = Joi.object<SetTokenAssignedPriceRequest>({
  dealType: Joi.string().valid("bulk", "pricePerTrack").required().messages({
    "any.required": "dealType is required",
    "any.only": "dealType must be either 'bulk' or 'pricePerTrack'",
  }),
  pricePerPack: Joi.number().positive().precision(2).required().messages({
    "any.required": "pricePerPack is required",
    "number.positive": "pricePerPack must be a positive number",
  }),
  iprsShare: Joi.when("dealType", {
    is: "bulk",
    then: Joi.number().min(0).precision(2).required().messages({
      "any.required": "iprsShare is required when dealType is bulk",
      "number.min": "iprsShare must be a non-negative number",
    }),
    otherwise: Joi.forbidden(),
  }),
  hooprShare: Joi.when("dealType", {
    is: "bulk",
    then: Joi.number().min(0).precision(2).required().messages({
      "any.required": "hooprShare is required when dealType is bulk",
      "number.min": "hooprShare must be a non-negative number",
    }),
    otherwise: Joi.forbidden(),
  }),
  keyName: Joi.string().trim().max(255).allow(null, "").optional().messages({
    "string.max": "keyName must be at most 255 characters",
  }),
});

export const deductTokensRequestSchema = Joi.object<DeductTokensRequest>({
  brandId: Joi.number().integer().positive().required().messages({
    "any.required": "brandId is required",
    "number.positive": "brandId must be a positive number",
  }),
  type: Joi.string().trim().min(1).max(255).required().messages({
    "any.required": "type is required",
    "string.empty": "type cannot be empty",
  }),
  amount: Joi.number().integer().positive().required().messages({
    "any.required": "amount is required",
    "number.positive": "amount must be a positive number",
  }),
  tokenAssignedId: Joi.number().integer().positive().optional().messages({
    "number.positive": "tokenAssignedId must be a positive number",
  }),
  reason: Joi.string().optional(),
});

export const getTokensQuerySchema = Joi.object({
  brandId: Joi.number().integer().positive().optional(),
  type: Joi.string().trim().optional(),
  page: Joi.number().integer().min(1).optional().default(1),
  limit: Joi.number().integer().min(1).max(100).optional().default(20),
  showInternalBrands: Joi.boolean().optional(),
});

export const getDeductionsQuerySchema = Joi.object({
  brandId: Joi.number().integer().positive().optional(),
  type: Joi.string().trim().optional(),
  reason: Joi.string().valid("LICENSE_PURCHASE", "INTERNAL_DEDUCTION").optional(),
  page: Joi.number().integer().min(1).optional().default(1),
  limit: Joi.number().integer().min(1).max(100).optional().default(20),
  showInternalBrands: Joi.boolean().optional(),
});
