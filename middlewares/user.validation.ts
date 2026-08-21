import Joi from "joi";
import type {
  CreateAuthRequestData,
  InviteUserAuthRequestData,
  LoginUserRequestData,
  ResetPasswordRequestData,
  CompleteProfileRequestData,
  SendOtpRequestData,
  VerifyOtpRequestData,
  SendEmailOtpRequestData,
  VerifyEmailOtpRequestData,
} from "../services/dto-service/modules.export";
import { ProfileRole } from "../services/dto-service/modules.export";
import { platformField } from "./platform.validation";
const profileRoleValues = Object.values(ProfileRole) as string[];

export const createAuthRequestSchema = Joi.object<CreateAuthRequestData>({
  email: Joi.string().email().required(),
  password: Joi.string().min(6).required(),
  platform: platformField.required(),
  brandId: Joi.number().integer().positive().optional(),
});

export const inviteUserAuthRequestSchema =
  Joi.object<InviteUserAuthRequestData>({
    email: Joi.string().email().required(),
  }).unknown(false);

export const completeProfileRequestSchema =
  Joi.object<CompleteProfileRequestData>({
    firstName: Joi.string().min(2).max(100).required(),
    lastName: Joi.string().min(2).max(100).required(),
    mobile: Joi.string().min(8).max(15).required(),
    countryCode: Joi.string().min(1).max(5).required(),
    profileRole: Joi.string()
      .valid(...profileRoleValues)
      .required(),
    // Brand block: only the person creating the brand sends these, and only
    // then is instagramLink mandatory — an invited user inherits the brand's.
    // Joi cannot see the user's brandId, so completeProfileService enforces it.
    brandName: Joi.string().min(2).max(255).optional(),
    instagramLink: Joi.string().max(500).optional(),
    youtubeLink: Joi.string().max(500).optional(),
    facebookLink: Joi.string().max(500).optional(),
  });

export const loginRequestSchema = Joi.object<LoginUserRequestData>({
  email: Joi.string().email().required(),
  password: Joi.string().min(6).required(),
  platform: platformField.required(),
});

export const resetPasswordRequestSchema = Joi.object<ResetPasswordRequestData>({
  resetToken: Joi.string().required().messages({
    "any.required": "Reset token is required. Please verify OTP first.",
    "string.empty": "Reset token is required. Please verify OTP first.",
  }),
  newPassword: Joi.string().min(6).required(),
  confirmPassword: Joi.string()
    .min(6)
    .required()
    .valid(Joi.ref("newPassword"))
    .messages({
      "any.only": "Passwords do not match",
    }),
  platform: platformField.required(),
});

export const updateProfileRequestSchema = Joi.object({
  firstName: Joi.string().min(2).max(100).optional(),
  lastName: Joi.string().min(2).max(100).optional(),
  mobile: Joi.string().min(8).max(15).optional(),
  countryCode: Joi.string().min(1).max(5).optional(),
  profileRole: Joi.string()
    .valid(...profileRoleValues)
    .optional(),
  instagramLink: Joi.string()
    .max(500)
    .pattern(/^(https?:\/\/\S+|@?[A-Za-z0-9._]{1,30})$/)
    .allow(null)
    .optional()
    .messages({
      "string.pattern.base":
        "Instagram link must be a valid URL or username",
    }),
  youtubeLink: Joi.string().uri().max(500).allow(null).optional(),
  facebookLink: Joi.string().uri().max(500).allow(null).optional(),
  brandName: Joi.string().min(2).max(255).optional(),
}).min(1);

export const sendOtpRequestSchema = Joi.object<SendOtpRequestData>({
  mobile: Joi.string().pattern(/^\d+$/).min(8).max(15).required(),
  countryCode: Joi.string().min(1).max(5).required(),
});

export const verifyOtpRequestSchema = Joi.object<VerifyOtpRequestData>({
  mobile: Joi.string().pattern(/^\d+$/).min(8).max(15).required(),
  countryCode: Joi.string().min(1).max(5).required(),
  otp: Joi.string().length(6).pattern(/^\d+$/).required(),
});

export const sendEmailOtpRequestSchema = Joi.object<SendEmailOtpRequestData>({
  email: Joi.string().email().required(),
  platform: platformField.required(),
}).unknown(false);

export const verifyEmailOtpRequestSchema =
  Joi.object<VerifyEmailOtpRequestData>({
    email: Joi.string().email().required(),
    otp: Joi.string().length(6).pattern(/^\d+$/).required(),
    platform: platformField.required(),
  }).unknown(false);
