import Joi from "joi";
import type { LoginUserRequestData } from "../services/dto-service/modules.export";

export const loginRequestSchema = Joi.object<LoginUserRequestData>({
    email: Joi.string().email().required(),
    password: Joi.string().min(6).required()
});
