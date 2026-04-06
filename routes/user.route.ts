import { Router } from "express";
import {
  login,
  logout,
  logoutAllSessions,
  resetPassword,
  refreshToken,
  create,
  inviteUser,
  completeProfile,
  getUserActivities,
  getUserSessions,
  getProfile,
  updateProfile,
  getUsers,
  removeInvitedUser,
  sendOtp,
  verifyOtp,
  sendEmailOtp,
  verifyEmailOtp,
} from "../controllers/user.controller";
import { validateRequest } from "../middlewares/validateRequest";
import {
  loginRequestSchema,
  resetPasswordRequestSchema,
  createAuthRequestSchema,
  inviteUserAuthRequestSchema,
  completeProfileRequestSchema,
  updateProfileRequestSchema,
  sendOtpRequestSchema,
  verifyOtpRequestSchema,
  sendEmailOtpRequestSchema,
  verifyEmailOtpRequestSchema,
} from "../middlewares/user.validation";
import { authenticateWithSession } from "../middlewares/authenticate";
import { Platform, UserRoles } from "../services/dto-service/modules.export";

const router = Router();

router.post(
  "/create",
  authenticateWithSession({
    roles: [UserRoles.MASTER, UserRoles.ADMIN],
    platforms: [Platform.ENTERPRISE, Platform.INTERNAL],
  }),
  validateRequest(createAuthRequestSchema),
  create,
);

router.post("/login", validateRequest(loginRequestSchema), login);

router.post("/refresh-token", refreshToken);

router.post("/logout", authenticateWithSession, logout);

router.post("/logout-all", authenticateWithSession, logoutAllSessions);

router.post(
  "/reset-password",
  validateRequest(resetPasswordRequestSchema),
  resetPassword,
);

router.post(
  "/invite",
  authenticateWithSession({
    roles: [UserRoles.MASTER, UserRoles.ADMIN, UserRoles.USER],
    platforms: [Platform.ENTERPRISE],
  }),
  validateRequest(inviteUserAuthRequestSchema),
  inviteUser,
);

router.post(
  "/complete-profile",
  authenticateWithSession({ platforms: [Platform.ENTERPRISE] }),
  validateRequest(completeProfileRequestSchema),
  completeProfile,
);

// Activity and Session endpoints
router.get(
  "/activities",
  authenticateWithSession({
    roles: [UserRoles.MASTER],
    platforms: [Platform.ENTERPRISE],
  }),
  getUserActivities,
);
router.get(
  "/sessions",
  authenticateWithSession({
    roles: [UserRoles.MASTER],
    platforms: [Platform.ENTERPRISE],
  }),
  getUserSessions,
);

// Profile endpoints
router.get("/profile", authenticateWithSession, getProfile);

router.put(
  "/profile",
  authenticateWithSession,
  validateRequest(updateProfileRequestSchema),
  updateProfile,
);

// Get all users under admin
router.get(
  "/list",
  authenticateWithSession({
    roles: [UserRoles.MASTER, UserRoles.ADMIN, UserRoles.USER],
    platforms: [Platform.ENTERPRISE],
  }),
  getUsers,
);

// Remove invited user — only MASTER and ADMIN can remove, USER cannot
router.delete(
  "/invited/:userId",
  authenticateWithSession({
    roles: [UserRoles.MASTER, UserRoles.ADMIN],
    platforms: [Platform.ENTERPRISE],
  }),
  removeInvitedUser,
);

// OTP endpoints (public — no auth required)
router.post("/send-otp", validateRequest(sendOtpRequestSchema), sendOtp);
router.post("/verify-otp", validateRequest(verifyOtpRequestSchema), verifyOtp);

// Email OTP endpoints (public — no auth required)
router.post(
  "/send-email-otp",
  validateRequest(sendEmailOtpRequestSchema),
  sendEmailOtp,
);
router.post(
  "/verify-email-otp",
  validateRequest(verifyEmailOtpRequestSchema),
  verifyEmailOtp,
);

export default router;
