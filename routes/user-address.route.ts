import { Router } from "express";
import Joi from "joi";
import { authenticateWithSession } from "../middlewares/authenticate";
import { validateRequest } from "../middlewares/validateRequest";
import {
  getAddresses,
  upsertBusinessAddress,
  upsertBillingAddress,
  deleteAddress,
} from "../controllers/user-address.controller";

const router = Router();

const businessAddressSchema = Joi.object({
  addressLine1: Joi.string().max(255).required(),
  addressLine2: Joi.string().max(255).optional().allow("", null),
  country: Joi.string().max(100).required(),
  state: Joi.string().max(100).required(),
  city: Joi.string().max(100).required(),
  postalCode: Joi.string().max(20).required(),
  pan: Joi.string().max(20).optional().allow("", null),
  gstin: Joi.string().max(50).optional().allow("", null),
}).unknown(false);

const billingAddressSchema = Joi.object({
  addressLine1: Joi.string().max(255).required(),
  addressLine2: Joi.string().max(255).optional().allow("", null),
  country: Joi.string().max(100).required(),
  state: Joi.string().max(100).required(),
  city: Joi.string().max(100).required(),
  postalCode: Joi.string().max(20).required(),
}).unknown(false);

// All address routes require auth
router.use(authenticateWithSession);

router.get("/", getAddresses);

router.put("/business", validateRequest(businessAddressSchema), upsertBusinessAddress);

router.put("/billing", validateRequest(billingAddressSchema), upsertBillingAddress);

router.delete("/:type", deleteAddress);

export default router;
