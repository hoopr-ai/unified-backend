import { Router } from "express";
import { createOrganization, createBrand } from "../controllers/organization.controller";
import { validateRequest } from "../middlewares/validateRequest";
import {
  createOrganizationRequestSchema,
  createBrandRequestSchema,
} from "../middlewares/organization.validation";
import { authenticateWithSession } from "../middlewares/authenticate";
import { UserRoles } from "../services/dto-service/modules.export";
import { Platform } from "../services/dto-service/constants/common.enums";

const router = Router();

router.post(
  "/create",
  authenticateWithSession({ roles: [UserRoles.MASTER], platforms: [Platform.ENTERPRISE] }),
  validateRequest(createOrganizationRequestSchema),
  createOrganization
);

router.post(
  "/brand/create",
  authenticateWithSession({ roles: [UserRoles.MASTER], platforms: [Platform.ENTERPRISE] }),
  validateRequest(createBrandRequestSchema),
  createBrand
);

export default router;
