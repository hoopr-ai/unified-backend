import { Router } from "express";
import { lookupCompany } from "../controllers/company-lookup.controller";
import { validateRequest } from "../middlewares/validateRequest";
import { lookupCompanyRequestSchema } from "../middlewares/company-lookup.validation";
import { authenticateWithSession } from "../middlewares/authenticate";

const router = Router();

/**
 * POST /company-lookup
 * Lookup company revenue using Google Gemini AI with web search
 * Requires authentication
 */
router.post(
  "/",
  authenticateWithSession,
  validateRequest(lookupCompanyRequestSchema),
  lookupCompany
);

export default router;
