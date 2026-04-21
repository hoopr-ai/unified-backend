import { Router } from "express";
import {
  getRails,
  getRailByKey,
  upsertRail,
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

export default router;
