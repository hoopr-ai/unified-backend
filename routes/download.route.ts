import { Router } from "express";
import {
  downloadTrack,
  getTokenBalance,
  assignTokens,
  getDownloadHistory,
  getBrandDownloadHistory,
} from "../controllers/download.controller";
import { authenticateWithSession } from "../middlewares/authenticate";
import { validateRequest } from "../middlewares/validateRequest";
import {
  downloadTrackRequestSchema,
  assignTokensRequestSchema,
} from "../middlewares/download.validation";
import { UserRoles } from "../services/dto-service/modules.export";

const router = Router();

// Download a track - requires authenticated user (USER, ADMIN)
router.post(
  "/track",
  authenticateWithSession({ roles: [UserRoles.USER, UserRoles.ADMIN] }),
  validateRequest(downloadTrackRequestSchema),
  downloadTrack
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

// Get user's download history
router.get(
  "/history",
  authenticateWithSession({ roles: [UserRoles.USER, UserRoles.ADMIN] }),
  getDownloadHistory
);

// Get brand's download history - requires ADMIN role
router.get(
  "/brand-history",
  authenticateWithSession({ roles: [UserRoles.ADMIN] }),
  getBrandDownloadHistory
);

export default router;
