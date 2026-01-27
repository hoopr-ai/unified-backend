import { Router } from "express";
import { createOrganization, createBrand } from "../controllers/organization.controller";
import { validateRequest } from "../middlewares/validateRequest";
import {
  createOrganizationRequestSchema,
  createBrandRequestSchema,
} from "../middlewares/organization.validation";
import { authenticateWithSession } from "../middlewares/authenticate";

const router = Router();

router.post(
  "/create",
  authenticateWithSession,
  validateRequest(createOrganizationRequestSchema),
  createOrganization
);

router.post(
  "/brand/create",
  authenticateWithSession,
  validateRequest(createBrandRequestSchema),
  createBrand
);

export default router;
