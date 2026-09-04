import type { Request, Response } from "express";
import {
  catchAsync,
  sendResponse,
  AppError,
} from "../services/helper-service/modules.export";
import { HttpStatusCode } from "../services/dto-service/constants/modules.export";
import {
  listCatalogueRightsService,
  getCatalogueRightsService,
  updateCatalogueRightsService,
  updateBrandOverrideService,
  deleteBrandOverrideService,
  getBrandEntitlementsService,
} from "../services/business-service/admin-catalogue-rights/modules.export";
import { brandIdParamSchema } from "../middlewares/admin-catalogue-rights.validation";
import { findUserById } from "../services/persistence-service/user/user.persistence.service";
import type { SessionPayload } from "../middlewares/authenticate";

interface AuthRequest extends Request {
  session?: SessionPayload;
}

/**
 * `:catalogue` is a NAME, not an id ("Regional & Indie", "Hoopr Originals") —
 * spaces and ampersands included. Express has already percent-decoded it; this
 * only guards against an empty or oversized segment. Whether the name is real
 * is decided against live owners.type in the service.
 */
const readCatalogueParam = (req: Request): string => {
  const raw = req.params.catalogue;
  if (typeof raw !== "string" || !raw.trim()) {
    throw new AppError("Invalid catalogue.", 400);
  }
  const catalogue = raw.trim();
  if (catalogue.length > 255) {
    throw new AppError("Invalid catalogue.", 400);
  }
  return catalogue;
};

const readBrandIdParam = (req: Request): number => {
  const { value, error } = brandIdParamSchema.validate(req.params.brandId);
  if (error) throw new AppError("Invalid brand id.", 400);
  return value as number;
};

// GET /admin/catalogue-rights — every catalogue, configured or not.
export const listCatalogueRights = catchAsync(
  async (_req: Request, res: Response) => {
    const catalogues = await listCatalogueRightsService();
    sendResponse(res, {
      status: HttpStatusCode.OK,
      data: { catalogues },
      message: "Catalogue rights fetched.",
    });
  },
);

// GET /admin/catalogue-rights/:catalogue — defaults + every brand override.
export const getCatalogueRights = catchAsync(
  async (req: Request, res: Response) => {
    const data = await getCatalogueRightsService(readCatalogueParam(req));
    sendResponse(res, {
      status: HttpStatusCode.OK,
      data,
      message: "Catalogue rights fetched.",
    });
  },
);

// PUT /admin/catalogue-rights/:catalogue — replace the defaults.
export const updateCatalogueRights = catchAsync(
  async (req: AuthRequest, res: Response) => {
    const data = await updateCatalogueRightsService(
      readCatalogueParam(req),
      req.body.rights,
      req.session?.userId ?? null,
    );
    sendResponse(res, {
      status: HttpStatusCode.OK,
      data,
      message: "Catalogue rights updated.",
    });
  },
);

// PUT /admin/catalogue-rights/:catalogue/brands/:brandId — set one brand's
// negotiated deviation. Returns the whole catalogue so the CMS re-renders the
// override list from one response.
export const updateBrandOverride = catchAsync(
  async (req: AuthRequest, res: Response) => {
    const data = await updateBrandOverrideService(
      readCatalogueParam(req),
      readBrandIdParam(req),
      req.body.rights,
      req.body.note ?? null,
      req.session?.userId ?? null,
    );
    sendResponse(res, {
      status: HttpStatusCode.OK,
      data,
      message: "Brand override saved.",
    });
  },
);

// DELETE /admin/catalogue-rights/:catalogue/brands/:brandId — revert the brand
// to the catalogue default.
export const deleteBrandOverride = catchAsync(
  async (req: Request, res: Response) => {
    const data = await deleteBrandOverrideService(
      readCatalogueParam(req),
      readBrandIdParam(req),
    );
    sendResponse(res, {
      status: HttpStatusCode.OK,
      data,
      message: "Brand override removed.",
    });
  },
);

// GET /catalogue-rights/me — the My Subscription screen's own read: tokens and
// effective rights per catalogue, for the caller's brand.
//
// brandId comes from the user record, never the query string — it is the whole
// authorization boundary here, and a client-supplied id would let any signed-in
// user read another brand's commercial terms.
export const getMyCatalogueEntitlements = catchAsync(
  async (req: AuthRequest, res: Response) => {
    const userId = req.session?.userId;
    if (!userId) throw new AppError("Unauthorized", 401);

    const user = await findUserById(userId);
    const brandId = user?.brandId;
    if (!brandId) {
      throw new AppError("No brand is associated with this account.", 403);
    }

    const data = await getBrandEntitlementsService(Number(brandId));
    sendResponse(res, {
      status: HttpStatusCode.OK,
      data,
      message: "Entitlements fetched.",
    });
  },
);
