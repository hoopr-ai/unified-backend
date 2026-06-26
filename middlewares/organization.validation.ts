import Joi from "joi";
import type { CreateOrganizationRequestData } from "../services/dto-service/modules.export";
import type { CreateBrandRequestData } from "../services/dto-service/modules.export";
import type {
  UpdateOrganizationRequestData,
  UpdateBrandRequestData,
} from "../services/dto-service/modules.export";
import { OrganizationStatus, BrandStatus } from "../services/dto-service/modules.export";

const organizationStatusValues = Object.values(OrganizationStatus) as string[];
const brandStatusValues = Object.values(BrandStatus) as string[];

export const createOrganizationRequestSchema = Joi.object<CreateOrganizationRequestData>({
  name: Joi.string().min(2).max(255).required(),
  description: Joi.string().max(1000).optional(),
  status: Joi.string().valid(...organizationStatusValues).optional(),
});

export const createBrandRequestSchema = Joi.object<CreateBrandRequestData>({
  organizationId: Joi.number().integer().positive().required(),
  name: Joi.string().min(2).max(255).required(),
  description: Joi.string().max(1000).optional(),
  status: Joi.string().valid(...brandStatusValues).optional(),
  insta_username: Joi.string().max(255).optional(),
});

export const updateOrganizationRequestSchema = Joi.object<UpdateOrganizationRequestData>({
  name: Joi.string().min(2).max(255).optional(),
  description: Joi.string().max(1000).allow("").optional(),
  status: Joi.string().valid(...organizationStatusValues).optional(),
}).min(1);

export const updateBrandRequestSchema = Joi.object<UpdateBrandRequestData>({
  name: Joi.string().min(2).max(255).optional(),
  description: Joi.string().max(1000).allow("").optional(),
  status: Joi.string().valid(...brandStatusValues).optional(),
  insta_username: Joi.string().max(255).allow("").optional(),
  restrictedOwners: Joi.array().items(Joi.string()).optional(),
  restrictedTrackTiers: Joi.array().items(Joi.string()).optional(),
}).min(1);
