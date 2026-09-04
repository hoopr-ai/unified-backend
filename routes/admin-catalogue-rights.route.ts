import { Router } from "express";
import { authenticateWithSession } from "../middlewares/authenticate";
import { requireFunctionality } from "../middlewares/requireFunctionality";
import { validateRequest } from "../middlewares/validateRequest";
import { Platform } from "../services/dto-service/modules.export";
import {
  updateCatalogueRightsSchema,
  updateBrandOverrideSchema,
} from "../middlewares/admin-catalogue-rights.validation";
import {
  listCatalogueRights,
  getCatalogueRights,
  updateCatalogueRights,
  updateBrandOverride,
  deleteBrandOverride,
} from "../controllers/admin-catalogue-rights.controller";

const router = Router();

// Same gate shape as admin-owner: an INTERNAL-platform session, then a
// `catalogue-rights` grant. Admins pass by role; other internal users need the
// functionality assigned (grant ids are catalogued in internal-fe's
// src/services/functionalities.ts — the backend stores whatever the grant UI
// sends and each endpoint enforces its own check).
//
// These endpoints edit commercial licensing terms for every brand on a
// catalogue, so the platform check is deliberate defence-in-depth: a valid
// SMASH or ENTERPRISE token must not reach them even with the grant.
const requireCatalogueRights = [
  authenticateWithSession({ platforms: [Platform.INTERNAL] }),
  requireFunctionality("catalogue-rights"),
];

// Every catalogue, including ones with no defaults row yet.
router.get("/", ...requireCatalogueRights, listCatalogueRights);

// One catalogue: defaults + every brand override.
//
// `:catalogue` is the NAME — "Regional & Indie" arrives percent-encoded as
// Regional%20%26%20Indie. There is no catalogue id to use instead; the name is
// the key both owners.type and token_assigned.type already carry.
router.get("/:catalogue", ...requireCatalogueRights, getCatalogueRights);

// Replace one catalogue's defaults. All six rights required.
router.put(
  "/:catalogue",
  ...requireCatalogueRights,
  validateRequest(updateCatalogueRightsSchema),
  updateCatalogueRights,
);

// Set one brand's negotiated deviation. Rights are PARTIAL — send only the keys
// that differ, or the brand stops tracking future changes to the default.
router.put(
  "/:catalogue/brands/:brandId",
  ...requireCatalogueRights,
  validateRequest(updateBrandOverrideSchema),
  updateBrandOverride,
);

// Revert one brand to the catalogue default.
router.delete(
  "/:catalogue/brands/:brandId",
  ...requireCatalogueRights,
  deleteBrandOverride,
);

export default router;
