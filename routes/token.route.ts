import { Router } from "express";
import {
  getTokenDetails,
  getTokens,
  getTokensByBrand,
  assignTokens,
  deductTokens,
  getTokenTypes,
  getBrandsWithTokens,
  getTokenDeductions,
  getTokenSummary,
} from "../controllers/token.controller";
import { authenticateWithSession } from "../middlewares/authenticate";
import { validateRequest } from "../middlewares/validateRequest";
import {
  assignTokensRequestSchema,
  deductTokensRequestSchema,
} from "../middlewares/token.validation";
import { UserRoles } from "../services/dto-service/modules.export";

const router = Router();

// Admin-only auth middleware
const adminAuth = authenticateWithSession({
  roles: [UserRoles.ADMIN],
});

// ============================================
// USER ENDPOINTS
// ============================================

/**
 * GET /tokens/details
 * Get token details for the authenticated user
 */
router.get(
  "/details",
  authenticateWithSession({ roles: [UserRoles.USER, UserRoles.ADMIN] }),
  getTokenDetails
);

// ============================================
// ADMIN ENDPOINTS
// ============================================

/**
 * GET /tokens
 * Get all tokens with optional filters (brandId, type, page, limit)
 */
router.get("/", getTokens);

/**
 * GET /tokens/types
 * Get all distinct token types
 */
router.get("/types", getTokenTypes);

/**
 * GET /tokens/brands
 * Get all brands with tokens summary
 */
router.get("/brands", getBrandsWithTokens);

/**
 * GET /tokens/summary
 * Get token summary by type (aggregate stats)
 */
router.get("/summary", getTokenSummary);

/**
 * GET /tokens/deductions
 * Get token deductions with filters
 */
router.get("/deductions", getTokenDeductions);

/**
 * GET /tokens/brand/:brandId
 * Get token details for a specific brand
 */
router.get("/brand/:brandId", getTokensByBrand);

/**
 * POST /tokens/assign
 * Assign tokens to a brand
 */
router.post(
  "/assign",
  // adminAuth,
  validateRequest(assignTokensRequestSchema),
  assignTokens
);

/**
 * POST /tokens/deduct
 * Deduct tokens from a brand (internal deduction)
 */
router.post(
  "/deduct",
  // adminAuth,
  validateRequest(deductTokensRequestSchema),
  deductTokens
);

export default router;
