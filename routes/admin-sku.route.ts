import { Router } from "express";
import { authenticateWithSession } from "../middlewares/authenticate";
import { requireFunctionality } from "../middlewares/requireFunctionality";
import { validateRequest } from "../middlewares/validateRequest";
import { Platform } from "../services/dto-service/modules.export";
import {
  upsertSkuSchema,
  bulkUpsertSkuSchema,
} from "../middlewares/admin-sku.validation";
import {
  listSkus,
  getSkuFilters,
  searchSkuArtists,
  upsertSku,
  bulkUpsertSkus,
} from "../controllers/admin-sku.controller";

const router = Router();

// Require an INTERNAL-platform session, then a `track-pricing` grant. Admins
// pass the grant check by role; other internal users need the functionality
// assigned (same id the internal-fe card/route are gated by). platform check is
// defence-in-depth so a SMASH/ENTERPRISE token can't reach catalogue pricing.
const requireTrackPricing = [
  authenticateWithSession({ platforms: [Platform.INTERNAL] }),
  requireFunctionality("track-pricing"),
];

// Filter dropdown data (owners + tiers + statuses). Before the param route.
router.get("/filters", ...requireTrackPricing, getSkuFilters);

// Artist typeahead for the multi-select filter.
router.get("/artists", ...requireTrackPricing, searchSkuArtists);

// Paginated list of tracks + their SKU.
router.get("/", ...requireTrackPricing, listSkus);

// Bulk upsert (explicit codes or owner/tier filter).
router.post(
  "/bulk",
  ...requireTrackPricing,
  validateRequest(bulkUpsertSkuSchema),
  bulkUpsertSkus,
);

// Single-track upsert.
router.put(
  "/:trackCode",
  ...requireTrackPricing,
  validateRequest(upsertSkuSchema),
  upsertSku,
);

export default router;
