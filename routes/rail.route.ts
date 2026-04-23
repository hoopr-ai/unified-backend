import { Router } from "express";
import {
  getRails,
  getRailsBatch,
  getRailByKey,
  upsertRail,
  deleteRail,
  editRailItems,
  reorderRails,
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

// GET /rails/:key - single rail by key
router.get("/:key", optionalAuthenticate, getRailByKey);

// POST /rails - create or update a rail (internal, authenticated)
router.post("/", authenticate, upsertRail);

// DELETE /rails/:railId - hard delete a rail and its items (internal, authenticated)
router.delete("/:railId", authenticate, deleteRail);

// PATCH /rails/:railId/items - edit rail items (delete, freeze, reorder, add)
router.patch("/:railId/items", authenticate, editRailItems);

export default router;
