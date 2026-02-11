import { Router } from "express";
import {
  licenseTrack,
  getTokenBalance,
  assignTokens,
  getBrandLicenseHistory,
  downloadTrack,
  addVideoLink,
  getVideoLinks,
} from "../controllers/licenses.controller";
import { authenticateWithSession } from "../middlewares/authenticate";
import { validateRequest } from "../middlewares/validateRequest";
import { assignTokensRequestSchema } from "../middlewares/licenses.validation";
import { UserRoles } from "../services/dto-service/modules.export";

const router = Router();

// License a track - requires authenticated user (USER, ADMIN)
router.post(
  "/track/:trackCode",
  authenticateWithSession({ roles: [UserRoles.USER, UserRoles.ADMIN] }),
  licenseTrack,
);

// Get token balance - requires authenticated user
router.get(
  "/token-balance",
  authenticateWithSession({ roles: [UserRoles.USER, UserRoles.ADMIN] }),
  getTokenBalance,
);

// Assign tokens to brand - requires MASTER role (admin)
router.post(
  "/assign-tokens",
  authenticateWithSession({ roles: [UserRoles.MASTER] }),
  validateRequest(assignTokensRequestSchema),
  assignTokens,
);

// Get brand's license history - requires ADMIN role
router.get(
  "/brand-history",
  authenticateWithSession({ roles: [UserRoles.ADMIN, UserRoles.USER] }),
  getBrandLicenseHistory,
);

// Download track - requires authenticated user
router.post(
  "/track-download",
  authenticateWithSession({ roles: [UserRoles.USER, UserRoles.ADMIN] }),
  downloadTrack,
);

// Add video link - requires authenticated user
router.post(
  "/video-link",
  authenticateWithSession({ roles: [UserRoles.USER, UserRoles.ADMIN] }),
  addVideoLink,
);

// Get video links by license ID - requires authenticated user
router.get(
  "/video-links/:licenseId",
  authenticateWithSession({ roles: [UserRoles.USER, UserRoles.ADMIN] }),
  getVideoLinks,
);

export default router;
