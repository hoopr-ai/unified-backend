import { Router } from "express";
import {
  getAllTracks,
  getTracksByCodes,
  getTracksByFilter,
  getTrackDetailsByCode,
  searchTracks,
  searchBrandsController,
  searchArtistsController,
  getRandomTrackPreview,
  streamTrackPreview,
} from "../controllers/track.controller";
import { validateRequest } from "../middlewares/validateRequest";
import { getTracksByCodesRequestSchema } from "../middlewares/track.validation";
import { optionalAuthenticate } from "../middlewares/authenticate";

const router = Router();

router.get("/search", optionalAuthenticate, searchTracks);
router.get("/brands/search", searchBrandsController);
router.get("/artists/search", searchArtistsController);
// Public API - Random track preview with short-lived signed URL (10-30 seconds)
router.get("/random-preview", getRandomTrackPreview);
// Public API - Stream track preview (first ~15 seconds, ~600KB)
// Cached by browser/CDN to minimize server bandwidth
router.get("/preview-stream/:trackCode", streamTrackPreview);
router.post("/", optionalAuthenticate, getAllTracks);
router.post("/by-codes", optionalAuthenticate, validateRequest(getTracksByCodesRequestSchema), getTracksByCodes);
router.get("/:trackCode", optionalAuthenticate, getTrackDetailsByCode);
router.post("/filter/:filterName", optionalAuthenticate, getTracksByFilter);

export default router;
