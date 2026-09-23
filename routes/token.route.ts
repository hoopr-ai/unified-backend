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
import { requireFunctionality } from "../middlewares/requireFunctionality";
import { validateRequest } from "../middlewares/validateRequest";
import {
  assignTokensRequestSchema,
  deductTokensRequestSchema,
  setTokenAssignedPriceSchema,
} from "../middlewares/token.validation";
import { Platform, UserRoles } from "../services/dto-service/modules.export";

const router = Router();

// Write auth: an INTERNAL-platform session, then the `tokens` grant. Same gate
// shape as admin-catalogue-rights and admin-owner.
//
// These used to be ADMIN-only by role, which meant the ops users who actually
// run the Tokens CMS could open every screen (internal-fe gates the page on the
// same `tokens` grant) and then hit a 403 the moment they saved. The grant is
// the real authorization boundary here — an admin hands it out deliberately —
// so the role check was gatekeeping without adding safety. Admins still pass by
// role: requireFunctionality lets them through without a grant.
//
// The platform check is deliberate defence-in-depth: these endpoints move
// commercial credit, so a valid SMASH or ENTERPRISE token must not reach them
// even if that account somehow carried the grant.
const tokenWriteAuth = [
  authenticateWithSession({ platforms: [Platform.INTERNAL] }),
  requireFunctionality("tokens"),
];

// Read-only auth: ADMIN and SALES can view token allocations, deductions, and brand-level
// summaries.
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
  ...tokenWriteAuth,
  validateRequest(assignTokensRequestSchema),
  assignTokens
);

/**
 * POST /tokens/deduct
 * Deduct tokens from a brand (internal deduction)
 */
router.post(
  "/deduct",
  ...tokenWriteAuth,
  validateRequest(deductTokensRequestSchema),
  deductTokens
);

/**
 * PATCH /tokens/:tokenAssignedId/price
 * Set or update the per-token price on a token_assigned row
 */
router.patch(
  "/:tokenAssignedId/price",
  ...tokenWriteAuth,
  validateRequest(setTokenAssignedPriceSchema),
  setTokenAssignedPrice
);

/**
 * GET /tokens/:tokenAssignedId/deductions
 * Get all deductions for a specific token allocation
 */
router.get("/:tokenAssignedId/deductions", tokenReadAuth, getDeductionsByAllocation);

export default router;
