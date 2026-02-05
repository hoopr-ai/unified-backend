import { Router } from "express";
import {
  getAllTracks,
  getTracksByCodes,
  getTracksByFilter,
  getTrackDetailsByCode,
} from "../controllers/track.controller";
import { validateRequest } from "../middlewares/validateRequest";
import { getTracksByCodesRequestSchema } from "../middlewares/track.validation";

const router = Router();

router.get("/", getAllTracks);
router.post("/by-codes", validateRequest(getTracksByCodesRequestSchema), getTracksByCodes);
router.get("/:trackCode", getTrackDetailsByCode);
router.get("/:filterName/:filterId", getTracksByFilter);

export default router;
