import Joi from "joi";
import type {
  CreateAuthRequestData, InviteUserAuthRequestData, LoginUserRequestData,
  ResetPasswordRequestData, CompleteProfileRequestData,
  SendOtpRequestData, VerifyOtpRequestData,
} from "../services/dto-service/modules.export";
import { Platform } from "../services/dto-service/constants/modules.export";
import { ProfileRole } from "../services/dto-service/modules.export";
const platformValues = Object.values(Platform) as string[];
const profileRoleValues = Object.values(ProfileRole) as string[];

export const createAuthRequestSchema = Joi.object<CreateAuthRequestData>({
    email: Joi.string().email().required(),
    password: Joi.string().min(6).required(),
    platform: Joi.string().valid(...platformValues).required(),
    brandId: Joi.number().integer().positive().optional(),
});

export const inviteUserAuthRequestSchema = Joi.object<InviteUserAuthRequestData>({
    email: Joi.string().email().required(),
}).unknown(false);

export const completeProfileRequestSchema = Joi.object<CompleteProfileRequestData>({
    firstName: Joi.string().min(2).max(100).required(),
    lastName: Joi.string().min(2).max(100).required(),
    mobile: Joi.string().min(8).max(15).required(),
    countryCode: Joi.string().min(1).max(5).required(),
    profileRole: Joi.string().valid(...profileRoleValues).required(),
});

export const loginRequestSchema = Joi.object<LoginUserRequestData>({
  email: Joi.string().email().required(),
  password: Joi.string().min(6).required(),
  platform: Joi.string()
    .valid(...platformValues)
    .required(),
});

export const resetPasswordRequestSchema = Joi.object<ResetPasswordRequestData>({
  email: Joi.string().email().required(),
  oldPassword: Joi.string().min(6).required(),
  newPassword: Joi.string().min(6).required(),
  platform: Joi.string()
    .valid(...platformValues)
    .required(),
});

export const updateProfileRequestSchema = Joi.object({
    firstName: Joi.string().min(2).max(100).optional(),
    lastName: Joi.string().min(2).max(100).optional(),
    mobile: Joi.string().min(8).max(15).optional(),
    countryCode: Joi.string().min(1).max(5).optional(),
    profileRole: Joi.string().valid(...profileRoleValues).optional(),
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
