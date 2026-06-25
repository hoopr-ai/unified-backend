import { Router } from "express";
import { authenticateWithSession } from "../middlewares/authenticate";
import { validateRequest } from "../middlewares/validateRequest";
import { Platform, UserRoles } from "../services/dto-service/modules.export";
import {
  upsertSkuSchema,
  bulkUpsertSkuSchema,
} from "../middlewares/admin-sku.validation";
import {
  listSkus,
  getSkuFilters,
  upsertSku,
  bulkUpsertSkus,
} from "../controllers/admin-sku.controller";

const router = Router();

// Track pricing is high-trust: require an INTERNAL-platform ADMIN token, same
// guard as /admin/internal-users. platform check is defence-in-depth so a
// SMASH/ENTERPRISE admin token can't reach catalogue pricing.
const requireInternalAdmin = authenticateWithSession({
  roles: [UserRoles.ADMIN],
  platforms: [Platform.INTERNAL],
});

// Filter dropdown data (owners + tiers). Registered before the param route.
router.get("/filters", requireInternalAdmin, getSkuFilters);

// Paginated list of tracks + their SKU.
router.get("/", requireInternalAdmin, listSkus);

// Bulk upsert (explicit codes or owner/tier filter).
router.post(
  "/bulk",
  requireInternalAdmin,
  validateRequest(bulkUpsertSkuSchema),
  bulkUpsertSkus,
);

// Single-track upsert.
router.put(
  "/:trackCode",
  requireInternalAdmin,
  validateRequest(upsertSkuSchema),
  upsertSku,
);

export default router;
