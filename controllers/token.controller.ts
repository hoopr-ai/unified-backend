import type { Request, Response } from "express";
import {
  getTokenDetailsService,
  getTokensListService,
  getTokenDetailsByBrandService,
  assignTokensAdminService,
  deductTokensAdminService,
  getTokenTypesService,
  getBrandsWithTokensService,
  getTokenDeductionsService,
  getTokenSummaryByTypeService,
  setTokenAssignedPriceService,
  getDeductionsByAllocationService,
} from "../services/business-service/modules.export";
import {
  catchAsync,
  sendResponse,
  sendError,
} from "../services/helper-service/modules.export";
import { HttpStatusCode } from "../services/dto-service/modules.export";
import type { SessionPayload } from "../middlewares/authenticate";

interface AuthRequest extends Request {
  session?: SessionPayload;
}

/**
 * Get token details for the authenticated user
 * GET /tokens/details
 */
export const getTokenDetails = catchAsync(async (req: AuthRequest, res: Response) => {
  const userId = req.session?.userId;
  if (!userId) {
    return sendError(res, HttpStatusCode.UNAUTHORIZED, "Unauthorized", {});
  }

  const response = await getTokenDetailsService(userId);
  sendResponse(res, {
    status: HttpStatusCode.OK,
    data: response,
    message: "Token details retrieved successfully",
  });
});

/**
 * Get all tokens with filters (Admin)
 * GET /tokens?brandId=123&type=chartbusters&page=1&limit=20&showInternalBrands=true
 *
 * Internal brands (Hoopr, Nova Media Co.) are excluded by default to match the
 * other CMS token listings. Pass `showInternalBrands=true` to include them.
 */
export const getTokens = catchAsync(async (req: Request, res: Response) => {
  const { brandId, type, page, limit } = req.query;
  const showInternalBrands = req.query.showInternalBrands === "true";

  const filters = {
    brandId: brandId ? Number(brandId) : undefined,
    type: type as string | undefined,
    page: page ? Number(page) : 1,
    limit: limit ? Number(limit) : 20,
    showInternalBrands,
  };

  const result = await getTokensListService(filters);

  sendResponse(res, {
    status: HttpStatusCode.OK,
    data: result,
    message: "Tokens fetched successfully",
  });
});

/**
 * Get token details for a specific brand (Admin)
 * GET /tokens/brand/:brandId
 */
export const getTokensByBrand = catchAsync(async (req: Request, res: Response) => {
  const brandId = Number(req.params.brandId);

  const result = await getTokenDetailsByBrandService(brandId);

  sendResponse(res, {
    status: HttpStatusCode.OK,
    data: result,
    message: "Token details fetched successfully",
  });
});


/**
 * Assign tokens to a brand (Admin)
 * POST /tokens/assign
 */
export const assignTokens = catchAsync(async (req: AuthRequest, res: Response) => {
  const { brandId, tokens, type, expiryDate, ownerIds, dealType, pricePerPack, iprsShare, hooprShare, keyName, isUnlimited } = req.body;
  const updatedById = req.session?.userId ?? null;
  const unlimited = isUnlimited === true;

  const result = await assignTokensAdminService(
    {
      brandId,
      tokens: unlimited ? undefined : tokens,
      type,
      expiryDate: !unlimited && expiryDate ? new Date(expiryDate) : undefined,
      ownerIds,
      dealType: unlimited ? undefined : dealType,
      pricePerPack: unlimited ? undefined : pricePerPack,
      iprsShare: unlimited ? null : (dealType === "bulk" ? iprsShare : null),
      hooprShare: unlimited ? null : (dealType === "bulk" ? hooprShare : null),
      keyName: keyName || null,
      isUnlimited: unlimited,
    },
    updatedById,
  );

  sendResponse(res, {
    status: HttpStatusCode.CREATED,
    data: result,
    message: "Tokens assigned successfully",
  });
});

/**
 * Set or update pricing details on a token_assigned row (Admin)
 * PATCH /tokens/:tokenAssignedId/price
 */
export const setTokenAssignedPrice = catchAsync(async (req: AuthRequest, res: Response) => {
  const tokenAssignedId = Number(req.params.tokenAssignedId);
  if (!Number.isInteger(tokenAssignedId) || tokenAssignedId <= 0) {
    return sendError(res, HttpStatusCode.BAD_REQUEST, "Invalid tokenAssignedId", {});
  }

  const { dealType, pricePerPack, iprsShare, hooprShare, keyName } = req.body;
  const updatedById = req.session?.userId ?? null;

  const result = await setTokenAssignedPriceService(
    tokenAssignedId,
    {
      dealType,
      pricePerPack,
      iprsShare: dealType === "bulk" ? iprsShare : null,
      hooprShare: dealType === "bulk" ? hooprShare : null,
      keyName,
    },
    updatedById
  );

  sendResponse(res, {
    status: HttpStatusCode.OK,
    data: result,
    message: "Token pricing set successfully",
  });
});

/**
 * Deduct tokens from a brand (Admin - internal deduction)
 * POST /tokens/deduct
 */
export const deductTokens = catchAsync(async (req: AuthRequest, res: Response) => {
  const { brandId, type, amount, tokenAssignedId } = req.body;
  const updatedById = req.session?.userId ?? null;

  const result = await deductTokensAdminService(
    {
      brandId,
      type,
      amount,
      tokenAssignedId,
    },
    updatedById,
  );

  sendResponse(res, {
    status: HttpStatusCode.OK,
    data: result,
    message: "Tokens deducted successfully",
  });
});

/**
 * Get all distinct token types (Admin)
 * GET /tokens/types
 */
export const getTokenTypes = catchAsync(async (req: Request, res: Response) => {
  const types = await getTokenTypesService();

  sendResponse(res, {
    status: HttpStatusCode.OK,
    data: { types },
    message: "Token types fetched successfully",
  });
});

/**
 * Get all brands with tokens summary (Admin)
 * GET /tokens/brands?showInternalBrands=true
 *
 * Internal brands (Hoopr, Nova Media Co.) are excluded by default so the CMS
 * listing matches what partners would expect to see. Pass
 * `showInternalBrands=true` to include them — used by the FE toggle.
 */
export const getBrandsWithTokens = catchAsync(async (req: Request, res: Response) => {
  const showInternalBrands = req.query.showInternalBrands === "true";

  const brands = await getBrandsWithTokensService({ showInternalBrands });

  sendResponse(res, {
    status: HttpStatusCode.OK,
    data: { brands },
    message: "Brands with tokens fetched successfully",
  });
});

/**
 * Get token deductions with filters (Admin)
 * GET /tokens/deductions?brandId=123&type=chartbusters&reason=LICENSE_PURCHASE&page=1&limit=20&showInternalBrands=true
 *
 * Internal brands are excluded by default — see getBrandsWithTokens above.
 */
export const getTokenDeductions = catchAsync(async (req: Request, res: Response) => {
  const { brandId, type, reason, page, limit } = req.query;
  const showInternalBrands = req.query.showInternalBrands === "true";

  const filters = {
    brandId: brandId ? Number(brandId) : undefined,
    type: type as string | undefined,
    reason: reason as string | undefined,
    page: page ? Number(page) : 1,
    limit: limit ? Number(limit) : 20,
    showInternalBrands,
  };

  const result = await getTokenDeductionsService(filters);

  sendResponse(res, {
    status: HttpStatusCode.OK,
    data: result,
    message: "Token deductions fetched successfully",
  });
});

/**
 * Get token summary by type (Admin)
 * GET /tokens/summary?showInternalBrands=true
 *
 * Internal brands are excluded by default — see getBrandsWithTokens above.
 */
export const getTokenSummary = catchAsync(async (req: Request, res: Response) => {
  const showInternalBrands = req.query.showInternalBrands === "true";

  const summary = await getTokenSummaryByTypeService({ showInternalBrands });

  sendResponse(res, {
    status: HttpStatusCode.OK,
    data: { summary },
    message: "Token summary fetched successfully",
  });
});

/**
 * Get deductions for a specific token allocation (Admin)
 * GET /tokens/:tokenAssignedId/deductions
 */
export const getDeductionsByAllocation = catchAsync(async (req: Request, res: Response) => {
  const tokenAssignedId = Number(req.params.tokenAssignedId);

  if (!Number.isInteger(tokenAssignedId) || tokenAssignedId <= 0) {
    return sendError(res, HttpStatusCode.BAD_REQUEST, "Invalid tokenAssignedId", {});
  }

  const result = await getDeductionsByAllocationService(tokenAssignedId);

  sendResponse(res, {
    status: HttpStatusCode.OK,
    data: result,
    message: "Deductions for allocation fetched successfully",
  });
});
