import { Router } from "express";
import { authenticateWithSession } from "../middlewares/authenticate";
import { requireFunctionality } from "../middlewares/requireFunctionality";
import { validateRequest } from "../middlewares/validateRequest";
import { Platform } from "../services/dto-service/modules.export";
import { updateUsageInfoSchema } from "../middlewares/admin-owner.validation";
import {
  listOwners,
  getOwner,
  updateOwnerUsageInfo,
} from "../controllers/admin-owner.controller";

const router = Router();

// Require an INTERNAL-platform session, then an `owner-usage-info` grant. Admins
// pass the grant check by role; other internal users need the functionality
// assigned (same id the internal-fe card/route are gated by). The platform check
// is defence-in-depth so a SMASH/ENTERPRISE token can't reach owner licensing.
const requireOwnerUsageInfo = [
  authenticateWithSession({ platforms: [Platform.INTERNAL] }),
  requireFunctionality("owner-usage-info"),
];

// Paginated owner list (+ ?search) for the picker.
router.get("/", ...requireOwnerUsageInfo, listOwners);

// Single owner + full usageInfo blob.
router.get("/:id", ...requireOwnerUsageInfo, getOwner);

// Overwrite one owner's usageInfo.
router.put(
  "/:id/usage-info",
  ...requireOwnerUsageInfo,
  validateRequest(updateUsageInfoSchema),
  updateOwnerUsageInfo,
);

export default router;
