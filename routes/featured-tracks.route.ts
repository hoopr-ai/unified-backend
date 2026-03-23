import { Router } from "express";
import {
  getFeaturedTracks,
  upsertFeaturedTracks,
} from "../controllers/featured-tracks.controller";
import { authenticate } from "../middlewares/authenticate";

const router = Router();

// GET /featured-tracks - Get featured tracks for the user's platform (public API)
router.get("/", getFeaturedTracks);

// POST /featured-tracks - Create or update featured tracks for the user's platform
router.post("/", authenticate, upsertFeaturedTracks);

export default router;
