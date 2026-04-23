import { Router } from "express";
import {
  getAllTracks,
  getTracksByCodes,
  getTracksByFilter,
  getTrackDetailsByCode,
  searchTracks,
  searchBrandsController,
} from "../controllers/track.controller";
import { validateRequest } from "../middlewares/validateRequest";
import { getTracksByCodesRequestSchema } from "../middlewares/track.validation";
import { optionalAuthenticate } from "../middlewares/authenticate";

const router = Router();

router.get("/search", searchTracks);
router.get("/brands/search", searchBrandsController);
router.post("/", optionalAuthenticate, getAllTracks);
router.post("/by-codes", optionalAuthenticate, validateRequest(getTracksByCodesRequestSchema), getTracksByCodes);
router.get("/:trackCode", optionalAuthenticate, getTrackDetailsByCode);
router.post("/filter/:filterName", optionalAuthenticate, getTracksByFilter);

export default router;
