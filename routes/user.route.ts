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
} from "../middlewares/user.validation";
import { authenticateWithSession } from "../middlewares/authenticate";

const router = Router();

router.post("/create", authenticateWithSession, validateRequest(createAuthRequestSchema), create);
router.post("/login", validateRequest(loginRequestSchema), login);
router.post("/logout", authenticateWithSession, logout);
router.post("/logout-all", authenticateWithSession, logoutAllSessions);
router.post(
  "/reset-password",
  validateRequest(resetPasswordRequestSchema),
  resetPassword
);
router.post("/invite", authenticateWithSession, validateRequest(createAuthRequestSchema), inviteUser);

// Activity and Session endpoints
router.get("/activities", authenticateWithSession, getUserActivities);
router.get("/sessions", authenticateWithSession, getUserSessions);

export default router;
