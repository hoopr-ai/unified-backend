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
  setTokenAssignedPrice,
  getDeductionsByAllocation,
} from "../controllers/token.controller";
import { authenticateWithSession } from "../middlewares/authenticate";
import { validateRequest } from "../middlewares/validateRequest";
import {
  assignTokensRequestSchema,
  deductTokensRequestSchema,
  setTokenAssignedPriceSchema,
} from "../middlewares/token.validation";
import { UserRoles } from "../services/dto-service/modules.export";

const router = Router();

// Admin-only auth middleware (used on write/mutation endpoints)
const adminAuth = authenticateWithSession({
  roles: [UserRoles.ADMIN],
});

// Read-only auth: ADMIN and SALES can view token allocations, deductions, and brand-level
// summaries. Write actions (assign / deduct / price changes) stay ADMIN-only below.
// Sales reps need this so they can answer "how many SMASH credits does brand X have left
// and when do they expire?" without escalating to an admin every time.
const tokenReadAuth = authenticateWithSession({
  roles: [UserRoles.ADMIN, UserRoles.SALES],
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
router.get("/", tokenReadAuth, getTokens);

/**
 * GET /tokens/types
 * Get all distinct token types
 */
router.get("/types", tokenReadAuth, getTokenTypes);

/**
 * GET /tokens/brands
 * Get all brands with tokens summary
 */
router.get("/brands", tokenReadAuth, getBrandsWithTokens);

/**
 * GET /tokens/summary
 * Get token summary by type (aggregate stats)
 */
router.get("/summary", tokenReadAuth, getTokenSummary);

/**
 * GET /tokens/deductions
 * Get token deductions with filters
 */
router.get("/deductions", tokenReadAuth, getTokenDeductions);

/**
 * GET /tokens/brand/:brandId
 * Get token details for a specific brand
 */
router.get("/brand/:brandId", tokenReadAuth, getTokensByBrand);

/**
 * POST /tokens/assign
 * Assign tokens to a brand
 */
router.post(
  "/assign",
  adminAuth,
  validateRequest(assignTokensRequestSchema),
  assignTokens
);

/**
 * POST /tokens/deduct
 * Deduct tokens from a brand (internal deduction)
 */
router.post(
  "/deduct",
  adminAuth,
  validateRequest(deductTokensRequestSchema),
  deductTokens
);

/**
 * PATCH /tokens/:tokenAssignedId/price
 * Set or update the per-token price on a token_assigned row
 */
router.patch(
  "/:tokenAssignedId/price",
  adminAuth,
  validateRequest(setTokenAssignedPriceSchema),
  setTokenAssignedPrice
);

/**
 * GET /tokens/:tokenAssignedId/deductions
 * Get all deductions for a specific token allocation
 */
router.get("/:tokenAssignedId/deductions", tokenReadAuth, getDeductionsByAllocation);

export default router;
