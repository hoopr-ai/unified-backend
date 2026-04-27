import { Router } from "express";
import {
  getRails,
  getRailsBatch,
  getRailByKey,
  getRailSeeAll,
  upsertRail,
  deleteRail,
  editRailItems,
  reorderRails,
  copyRail,
  refreshRails,
  triggerBrandRecommendation,
  clearRailsCache,
} from "../controllers/rail.controller";
import {
  authenticateWithSession,
  optionalAuthenticate,
} from "../middlewares/authenticate";
import { UserRoles } from "../services/dto-service/modules.export";

const router = Router();

// Admin-only auth (matches token routes pattern)
const adminAuth = authenticateWithSession({ roles: [UserRoles.ADMIN, UserRoles.MUSIC] });

// GET /rails - resolved homepage rails for brand (public, user-aware if authenticated)
router.get("/", optionalAuthenticate, getRails);

// GET /rails/batch - get rails in batches (paginated)
router.get("/batch", optionalAuthenticate, getRailsBatch);

// PATCH /rails/reorder - reorder rails (bulk update order values)
router.patch("/reorder", adminAuth, reorderRails);

// POST /rails/copy - copy a rail to multiple target pages
router.post("/copy", adminAuth, copyRail);

// POST /rails/refresh - trigger manual rail refresh job
router.post("/refresh", adminAuth, refreshRails);

// POST /rails/brand-recommend - trigger brand recommendation creation
// If brandId is provided, creates for that brand. Otherwise processes ALL brands (1 per 5 seconds)
router.post("/brand-recommend", adminAuth, triggerBrandRecommendation);

// POST /rails/clear-cache - clear Redis cache for rails
// Body: { pattern?: string, flushAll?: boolean }
router.post("/clear-cache", clearRailsCache);

// GET /rails/:railId/see-all - paginated full content for one rail
// Must be declared before "/:key" so it isn't shadowed.
router.get("/:railId/see-all", optionalAuthenticate, getRailSeeAll);

// GET /rails/:key - single rail by key
router.get("/:key", optionalAuthenticate, getRailByKey);

// POST /rails - create or update a rail (internal, authenticated)
router.post("/", adminAuth, upsertRail);

// DELETE /rails/:railId - hard delete a rail and its items (internal, authenticated)
router.delete("/:railId", adminAuth, deleteRail);

// PATCH /rails/:railId/items - edit rail items (delete, freeze, reorder, add)
router.patch("/:railId/items", adminAuth, editRailItems);

export default router;
