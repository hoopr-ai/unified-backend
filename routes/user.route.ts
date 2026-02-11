import { Router } from "express";
import {
  login,
  logout,
  logoutAllSessions,
  resetPassword,
  create,
  inviteUser,
  completeProfile,
  getUserActivities,
  getUserSessions,
  getProfile,
  updateProfile,
  getUsers,
} from "../controllers/user.controller";
import { validateRequest } from "../middlewares/validateRequest";
import {
  loginRequestSchema,
  resetPasswordRequestSchema,
  createAuthRequestSchema,
  inviteUserAuthRequestSchema,
  completeProfileRequestSchema,
  updateProfileRequestSchema,
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

router.post(
  "/complete-profile",
  authenticateWithSession({ platforms: [Platform.ENTERPRISE] }),
  validateRequest(completeProfileRequestSchema),
  completeProfile
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

// Profile endpoints
router.get(
  "/profile",
  authenticateWithSession,
  getProfile
);

router.put(
  "/profile",
  authenticateWithSession,
  validateRequest(updateProfileRequestSchema),
  updateProfile
);

// Get all users under admin
router.get(
  "/list",
  authenticateWithSession({ roles: [UserRoles.ADMIN], platforms: [Platform.ENTERPRISE] }),
  getUsers
);

export default router;
