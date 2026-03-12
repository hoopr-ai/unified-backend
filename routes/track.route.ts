import { Router } from "express";
import {
  getAllTracks,
  getTracksByCodes,
  getTracksByFilter,
  getTrackDetailsByCode,
} from "../controllers/track.controller";
import { validateRequest } from "../middlewares/validateRequest";
import { getTracksByCodesRequestSchema } from "../middlewares/track.validation";
import { authenticate } from "../middlewares/authenticate";

const router = Router();

router.post("/", authenticate, getAllTracks);
router.post("/by-codes", authenticate, validateRequest(getTracksByCodesRequestSchema), getTracksByCodes);
router.get("/:trackCode", authenticate, getTrackDetailsByCode);
router.post("/filter/:filterName", authenticate, getTracksByFilter);

export default router;
