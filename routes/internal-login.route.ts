import { Router } from "express";
import { validateRequest } from "../middlewares/validateRequest";
import {
  sendInternalLoginOtpSchema,
  verifyInternalLoginOtpSchema,
} from "../middlewares/internal-login.validation";
import {
  sendInternalLoginOtp,
  verifyInternalLoginOtp,
} from "../controllers/internal-login.controller";

const router = Router();

// Public — no auth required (this IS the auth flow).
// Both endpoints validate that the email belongs to an active INTERNAL user, so
// these can't be used to issue OTPs to ENTERPRISE / CREATOR / STUDIO emails.
router.post(
  "/send-otp",
  validateRequest(sendInternalLoginOtpSchema),
  sendInternalLoginOtp
);

router.post(
  "/verify-otp",
  validateRequest(verifyInternalLoginOtpSchema),
  verifyInternalLoginOtp
);

export default router;
