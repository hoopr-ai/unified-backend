import { Router } from "express";
import {
  licenseTrack,
  getTokenBalance,
  assignTokens,
  getLicenseHistory,
  getBrandLicenseHistory,
} from "../controllers/licenses.controller";
import { authenticateWithSession } from "../middlewares/authenticate";
import { validateRequest } from "../middlewares/validateRequest";
import {
  licenseTrackRequestSchema,
  assignTokensRequestSchema,
} from "../middlewares/licenses.validation";
import { UserRoles } from "../services/dto-service/modules.export";

const router = Router();

// License a track - requires authenticated user (USER, ADMIN)
router.post(
  "/track/:trackCode",
  authenticateWithSession({ roles: [UserRoles.USER, UserRoles.ADMIN] }),
  licenseTrack
);

// Get token balance - requires authenticated user
router.get(
  "/token-balance",
  authenticateWithSession({ roles: [UserRoles.USER, UserRoles.ADMIN] }),
  getTokenBalance
);

// Assign tokens to brand - requires MASTER role (admin)
router.post(
  "/assign-tokens",
  authenticateWithSession({ roles: [UserRoles.MASTER] }),
  validateRequest(assignTokensRequestSchema),
  assignTokens
);

// Get user's license history
router.get(
  "/history",
  authenticateWithSession({ roles: [UserRoles.USER, UserRoles.ADMIN] }),
  getLicenseHistory
);

// Get brand's license history - requires ADMIN role
router.get(
  "/brand-history",
  authenticateWithSession({ roles: [UserRoles.ADMIN] }),
  getBrandLicenseHistory
);

export default router;
