import { Router } from "express";
import {
  getRails,
  getRailsBatch,
  getRailByKey,
  upsertRail,
  deleteRail,
  editRailItems,
  reorderRails,
  copyRail,
  refreshRails,
  triggerBrandRecommendation,
} from "../controllers/rail.controller";
import {
  authenticate,
  optionalAuthenticate,
} from "../middlewares/authenticate";

const router = Router();

// GET /rails - resolved homepage rails for brand (public, user-aware if authenticated)
router.get("/", optionalAuthenticate, getRails);

// GET /rails/batch - get rails in batches (paginated)
router.get("/batch", optionalAuthenticate, getRailsBatch);

// PATCH /rails/reorder - reorder rails (bulk update order values)
router.patch("/reorder", authenticate, reorderRails);

// POST /rails/copy - copy a rail to multiple target pages
router.post("/copy", authenticate, copyRail);

// POST /rails/refresh - trigger manual rail refresh job
router.post("/refresh", authenticate, refreshRails);

// POST /rails/brand-recommend - trigger brand recommendation creation
// If brandId is provided, creates for that brand. Otherwise processes ALL brands (1 per 5 seconds)
router.post("/brand-recommend", authenticate, triggerBrandRecommendation);

// GET /rails/:key - single rail by key
router.get("/:key", optionalAuthenticate, getRailByKey);

// POST /rails - create or update a rail (internal, authenticated)
router.post("/", authenticate, upsertRail);

// DELETE /rails/:railId - hard delete a rail and its items (internal, authenticated)
router.delete("/:railId", authenticate, deleteRail);

// PATCH /rails/:railId/items - edit rail items (delete, freeze, reorder, add)
router.patch("/:railId/items", authenticate, editRailItems);

export default router;
