import { Router } from "express";
import { login, resetPassword, create, inviteUser } from "../controllers/user.controller";
import { validateRequest } from "../middlewares/validateRequest";
import {
  loginRequestSchema,
  resetPasswordRequestSchema,
  createAuthRequestSchema,
} from "../middlewares/user.auth.validation";
import { authenticate } from "../middlewares/authenticate";

const router = Router();
router.post("/create", authenticate, validateRequest(createAuthRequestSchema), create);
router.post("/login", validateRequest(loginRequestSchema), login);
router.post(
  "/reset-password",
  validateRequest(resetPasswordRequestSchema),
  resetPassword
);
router.post("/invite", authenticate, validateRequest(createAuthRequestSchema), inviteUser);
export default router;
