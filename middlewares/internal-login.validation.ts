import Joi from "joi";

export const sendInternalLoginOtpSchema = Joi.object({
  email: Joi.string().email().required(),
}).unknown(false);

export const verifyInternalLoginOtpSchema = Joi.object({
  email: Joi.string().email().required(),
  otp: Joi.string()
    .length(6)
    .pattern(/^\d{6}$/)
    .required()
    .messages({
      "string.length": "OTP must be 6 digits",
      "string.pattern.base": "OTP must be 6 digits",
    }),
}).unknown(false);
