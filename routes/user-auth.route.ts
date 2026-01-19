import { Router } from "express";
import { login, resetPassword } from "../controllers/user.controller";
import { validateRequest } from "../middlewares/validateRequest";
import {
  loginRequestSchema,
  resetPasswordRequestSchema,
} from "../middlewares/user.auth.validation";

const router = Router();

// Routes without authentication
router.post("/login", validateRequest(loginRequestSchema), login);
router.post(
  "/reset-password",
  validateRequest(resetPasswordRequestSchema),
  resetPassword
);

export default router;
