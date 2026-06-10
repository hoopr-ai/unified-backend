import { Router } from "express";
import { authenticateWithSession } from "../middlewares/authenticate";
import { validateRequest } from "../middlewares/validateRequest";
import { Platform, UserRoles } from "../services/dto-service/modules.export";
import {
  createInternalUserSchema,
  updateInternalUserFunctionalitiesSchema,
} from "../middlewares/admin-internal-users.validation";
import {
  createInternalUser,
  listInternalUsers,
  deactivateInternalUser,
  reactivateInternalUser,
  updateInternalUserFunctionalities,
  getInternalUserMe,
} from "../controllers/admin-internal-users.controller";

const router = Router();

// Strictly INTERNAL admin: JWT must have role=ADMIN AND platform=INTERNAL.
// platform check is defence-in-depth — a SMASH/ENTERPRISE admin token must not
// be able to manage Hoopr employees.
const requireInternalAdmin = authenticateWithSession({
  roles: [UserRoles.ADMIN],
  platforms: [Platform.INTERNAL],
});

// Any logged-in INTERNAL user (not just admins) — used by /me to re-pull the
// caller's own live access.
const requireInternalUser = authenticateWithSession({
  platforms: [Platform.INTERNAL],
});

router.post(
  "/",
  requireInternalAdmin,
  validateRequest(createInternalUserSchema),
  createInternalUser
);

router.get("/", requireInternalAdmin, listInternalUsers);

// Caller's own live role + functionalities. Any internal user, not just admins.
router.get("/me", requireInternalUser, getInternalUserMe);

// v2: deactivate / reactivate. Replaces the v1 reset-password endpoint — admins no longer
// touch passwords. Users set their own (optional) password via the existing
// /user/forgot-password OTP→reset flow.
router.post(
  "/:id/deactivate",
  requireInternalAdmin,
  deactivateInternalUser
);

router.post(
  "/:id/reactivate",
  requireInternalAdmin,
  reactivateInternalUser
);

// Replace a non-admin user's functionality grant list. Admin-only.
router.patch(
  "/:id/functionalities",
  requireInternalAdmin,
  validateRequest(updateInternalUserFunctionalitiesSchema),
  updateInternalUserFunctionalities
);

export default router;
