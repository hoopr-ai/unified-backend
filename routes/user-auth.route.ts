import { Router } from "express";
import { login, resetPassword, create } from "../controllers/user.controller";
import { validateRequest } from "../middlewares/validateRequest";
import {
  loginRequestSchema,
  resetPasswordRequestSchema,
  createAuthRequestSchema,
} from "../middlewares/user.auth.validation";


const router = Router();
router.post("/create", validateRequest(createAuthRequestSchema), create);
router.post("/login", validateRequest(loginRequestSchema), login);
router.post(
  "/reset-password",
  validateRequest(resetPasswordRequestSchema),
  resetPassword
);

export default router;
