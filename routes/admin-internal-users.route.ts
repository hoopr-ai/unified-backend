import { Router } from "express";
import { authenticateWithSession } from "../middlewares/authenticate";
import { validateRequest } from "../middlewares/validateRequest";
import { Platform, UserRoles } from "../services/dto-service/modules.export";
import { createInternalUserSchema } from "../middlewares/admin-internal-users.validation";
import {
  createInternalUser,
  listInternalUsers,
  resetInternalUserPassword,
} from "../controllers/admin-internal-users.controller";

const router = Router();

// Strictly INTERNAL admin: JWT must have role=ADMIN AND platform=INTERNAL.
// platform check is defence-in-depth — a SMASH/ENTERPRISE admin token must not
// be able to manage Hoopr employees.
const requireInternalAdmin = authenticateWithSession({
  roles: [UserRoles.ADMIN],
  platforms: [Platform.INTERNAL],
});

router.post(
  "/",
  requireInternalAdmin,
  validateRequest(createInternalUserSchema),
  createInternalUser
);

router.get("/", requireInternalAdmin, listInternalUsers);

router.post(
  "/:id/reset-password",
  requireInternalAdmin,
  resetInternalUserPassword
);

export default router;
