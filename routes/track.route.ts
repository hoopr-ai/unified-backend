import { Router } from "express";
import {
  getAllTracks,
  getTracksByCodes,
} from "../controllers/track.controller";
import { validateRequest } from "../middlewares/validateRequest";
import { getTracksByCodesRequestSchema } from "../middlewares/track.validation";

const router = Router();

router.get("/", getAllTracks);
router.post("/by-codes", validateRequest(getTracksByCodesRequestSchema), getTracksByCodes);

export default router;
