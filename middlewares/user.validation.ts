import Joi from "joi";
import type {
  CreateAuthRequestData, LoginUserRequestData,
  ResetPasswordRequestData,
} from "../services/dto-service/modules.export";
import { Platform } from "../services/dto-service/constants/modules.export";
const platformValues = Object.values(Platform) as string[];

export const createAuthRequestSchema = Joi.object<CreateAuthRequestData>({
    email: Joi.string().email().required(),
    firstName: Joi.string().min(2).max(100).required(),
    lastName: Joi.string().min(2).max(100).required(),
    mobile: Joi.string().min(8).max(15).required(),
    password: Joi.string().min(6).required(),
    platform: Joi.string().valid(...platformValues).required(),
    brandId: Joi.number().integer().positive().optional(),
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
