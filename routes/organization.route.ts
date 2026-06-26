import { Router } from "express";
import {
  createOrganization,
  createBrand,
  listOrganizations,
  updateOrganization,
  listBrandsByOrganization,
  getBrandDetail,
  updateBrand,
  listUsersByBrand,
  listTrackTiers,
} from "../controllers/organization.controller";
import { validateRequest } from "../middlewares/validateRequest";
import {
  createOrganizationRequestSchema,
  createBrandRequestSchema,
  updateOrganizationRequestSchema,
  updateBrandRequestSchema,
} from "../middlewares/organization.validation";
import { authenticateWithSession } from "../middlewares/authenticate";
import { UserRoles } from "../services/dto-service/modules.export";
import { Platform } from "../services/dto-service/constants/common.enums";

const router = Router();

// Roles allowed to manage client credentials (orgs / brands / users)
const manageAuth = authenticateWithSession({
  roles: [UserRoles.MASTER, UserRoles.ADMIN, UserRoles.SALES],
  platforms: [Platform.ENTERPRISE, Platform.INTERNAL],
});

// ─── Static routes (must precede param routes) ────────────────────────────────

router.get("/track-tiers", manageAuth, listTrackTiers);

router.get("/", manageAuth, listOrganizations);

router.post(
  "/create",
  manageAuth,
  validateRequest(createOrganizationRequestSchema),
  createOrganization,
);

router.post(
  "/brand/create",
  manageAuth,
  validateRequest(createBrandRequestSchema),
  createBrand,
);

// ─── Brand routes ─────────────────────────────────────────────────────────────

router.get("/brand/:brandId", manageAuth, getBrandDetail);

router.put(
  "/brand/:brandId",
  manageAuth,
  validateRequest(updateBrandRequestSchema),
  updateBrand,
);

router.get("/brand/:brandId/users", manageAuth, listUsersByBrand);

// ─── Organization param routes ────────────────────────────────────────────────

router.put(
  "/:organizationId",
  manageAuth,
  validateRequest(updateOrganizationRequestSchema),
  updateOrganization,
);

router.get("/:organizationId/brands", manageAuth, listBrandsByOrganization);

export default router;
