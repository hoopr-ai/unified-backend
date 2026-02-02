import { Router } from "express";
import { createLicenseType } from "../controllers/licenseType.controller";
import { authenticateWithSession } from "../middlewares/authenticate";
import { validateRequest } from "../middlewares/validateRequest";
import { createLicenseTypeRequestSchema } from "../middlewares/licenses.validation";
import { UserRoles } from "../services/dto-service/modules.export";

const router = Router();

// Create a new license type - requires MASTER role
router.post(
  "/",
  authenticateWithSession({ roles: [UserRoles.MASTER] }),
  validateRequest(createLicenseTypeRequestSchema),
  createLicenseType
);

export default router;
