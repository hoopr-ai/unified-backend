import { Router } from "express";
import Joi from "joi";
import { authenticateWithSession } from "../middlewares/authenticate";
import { validateRequest } from "../middlewares/validateRequest";
import {
  getBusinessAddress,
  getBillingAddress,
  upsertBusinessAddress,
  upsertBillingAddress,
  deleteAddress,
} from "../controllers/user-address.controller";

const router = Router();

const businessAddressSchema = Joi.object({
  addressLine1: Joi.string().max(255).required(),
  addressLine2: Joi.string().max(255).required(),
  country: Joi.string().max(100).required(),
  state: Joi.string().max(100).required(),
  city: Joi.string().max(100).required(),
  postalCode: Joi.string().max(20).required(),
  pan: Joi.string().max(20).required(),
  gstin: Joi.string().max(50).required(),
}).unknown(false);

const billingAddressSchema = Joi.object({
  addressLine1: Joi.string().max(255).required(),
  addressLine2: Joi.string().max(255).required(),
  country: Joi.string().max(100).required(),
  state: Joi.string().max(100).required(),
  city: Joi.string().max(100).required(),
  postalCode: Joi.string().max(20).required(),
  sameAsBusinessAddress: Joi.boolean().optional().default(false),
}).unknown(false);

router.use(authenticateWithSession);

router.get("/business", getBusinessAddress);
router.get("/billing", getBillingAddress);

router.put("/business", validateRequest(businessAddressSchema), upsertBusinessAddress);
router.put("/billing", validateRequest(billingAddressSchema), upsertBillingAddress);

router.delete("/:type", deleteAddress);

export default router;
