import { Router } from "express";
import {
  getAllTracks,
  getTracksByCodes,
} from "../controllers/track.controller";

const router = Router();

router.get("/", getAllTracks);
router.post("/by-codes", getTracksByCodes);

export default router;
