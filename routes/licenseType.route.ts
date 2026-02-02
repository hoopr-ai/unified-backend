import { Router } from "express";
import {
  createLicenseType,
  getLicenseTypeById,
  getAllLicenseTypes,
  updateLicenseType,
  deleteLicenseType,
} from "../controllers/licenseType.controller";
import { authenticateWithSession } from "../middlewares/authenticate";
import { validateRequest } from "../middlewares/validateRequest";
import {
  createLicenseTypeRequestSchema,
  updateLicenseTypeRequestSchema,
} from "../middlewares/licenses.validation";
import { UserRoles } from "../services/dto-service/modules.export";

const router = Router();

// Create a new license type - requires MASTER role
router.post(
  "/",
  authenticateWithSession({ roles: [UserRoles.MASTER] }),
  validateRequest(createLicenseTypeRequestSchema),
  createLicenseType
);

// Get all license types - requires authenticated user
router.get(
  "/",
  authenticateWithSession({ roles: [UserRoles.USER, UserRoles.ADMIN, UserRoles.MASTER] }),
  getAllLicenseTypes
);

// Get license type by ID - requires authenticated user
router.get(
  "/:id",
  authenticateWithSession({ roles: [UserRoles.USER, UserRoles.ADMIN, UserRoles.MASTER] }),
  getLicenseTypeById
);

// Update license type - requires MASTER role
router.put(
  "/:id",
  authenticateWithSession({ roles: [UserRoles.MASTER] }),
  validateRequest(updateLicenseTypeRequestSchema),
  updateLicenseType
);

// Delete license type (soft delete) - requires MASTER role
router.delete(
  "/:id",
  authenticateWithSession({ roles: [UserRoles.MASTER] }),
  deleteLicenseType
);

export default router;
