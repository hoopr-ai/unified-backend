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
  tokens: Joi.number().integer().positive().required().messages({
    "any.required": "tokens is required",
    "number.positive": "tokens must be a positive number",
  }),
  type: Joi.string().trim().min(1).max(255).required().messages({
    "any.required": "type is required",
    "string.empty": "type cannot be empty",
  }),
  expiryDate: Joi.date().optional().messages({
    "date.base": "expiryDate must be a valid date",
  }),
  ownerIds: Joi.array().items(Joi.string()).optional(),
  pricePerToken: Joi.number().positive().precision(4).optional().messages({
    "number.positive": "pricePerToken must be a positive number",
  }),
});

export const setTokenAssignedPriceSchema = Joi.object<SetTokenAssignedPriceRequest>({
  pricePerToken: Joi.number().positive().precision(4).required().messages({
    "any.required": "pricePerToken is required",
    "number.positive": "pricePerToken must be a positive number",
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
});

export const getDeductionsQuerySchema = Joi.object({
  brandId: Joi.number().integer().positive().optional(),
  type: Joi.string().trim().optional(),
  reason: Joi.string().valid("LICENSE_PURCHASE", "INTERNAL_DEDUCTION").optional(),
  page: Joi.number().integer().min(1).optional().default(1),
  limit: Joi.number().integer().min(1).max(100).optional().default(20),
});
