import { Router } from "express";
import {
  login,
} from "../controllers/user.controller";
import { validateRequest } from "../middlewares/validateRequest";
import { loginRequestSchema } from "../middlewares/user.auth.validation";


const router = Router();

// Routes without authentication
router.post("/login", validateRequest(loginRequestSchema), login);

export default router;
