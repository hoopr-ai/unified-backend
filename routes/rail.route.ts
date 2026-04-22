import { Router } from "express";
import {
  getRails,
  getRailByKey,
  upsertRail,
  deleteRail,
  editRailItems,
} from "../controllers/rail.controller";
import {
  authenticate,
  optionalAuthenticate,
} from "../middlewares/authenticate";

const router = Router();

// GET /rails - resolved homepage rails for brand (public, user-aware if authenticated)
router.get("/", optionalAuthenticate, getRails);

// GET /rails/:key - single rail by key
router.get("/:key", optionalAuthenticate, getRailByKey);

// POST /rails - create or update a rail (internal, authenticated)
router.post("/", authenticate, upsertRail);

// DELETE /rails/:railId - hard delete a rail and its items (internal, authenticated)
router.delete("/:railId", authenticate, deleteRail);

// PATCH /rails/:railId/items - edit rail items (delete, freeze, reorder, add)
router.patch("/:railId/items", authenticate, editRailItems);

export default router;
