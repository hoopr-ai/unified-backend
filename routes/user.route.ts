import { Router } from "express";
import {
  login,
  logout,
  logoutAllSessions,
  resetPassword,
  create,
  inviteUser,
  getUserActivities,
  getUserSessions,
} from "../controllers/user.controller";
import { validateRequest } from "../middlewares/validateRequest";
import {
  loginRequestSchema,
  resetPasswordRequestSchema,
  createAuthRequestSchema,
  inviteUserAuthRequestSchema,
} from "../middlewares/user.validation";
import { authenticateWithSession } from "../middlewares/authenticate";
import { Platform, UserRoles } from "../services/dto-service/modules.export";

const router = Router();

router.post(
  "/create",
  authenticateWithSession({ roles: [UserRoles.MASTER], platforms: [Platform.ENTERPRISE] }),
  validateRequest(createAuthRequestSchema),
  create
);

router.post(
  "/login",
  validateRequest(loginRequestSchema),
  login
);

router.post(
  "/logout",
  authenticateWithSession,
  logout
);

router.post("/logout-all", authenticateWithSession, logoutAllSessions);

router.post(
  "/reset-password",
  validateRequest(resetPasswordRequestSchema),
  resetPassword
);

router.post(
  "/invite",
  authenticateWithSession({ roles: [UserRoles.ADMIN], platforms: [Platform.ENTERPRISE] }),
  validateRequest(inviteUserAuthRequestSchema),
  inviteUser
);

// Activity and Session endpoints
router.get(
  "/activities",
  authenticateWithSession({ roles: [UserRoles.MASTER], platforms: [Platform.ENTERPRISE] }),
  getUserActivities
);
router.get(
  "/sessions",
  authenticateWithSession({ roles: [UserRoles.MASTER], platforms: [Platform.ENTERPRISE] }),
  getUserSessions
);

export default router;
