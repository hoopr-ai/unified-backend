import { Router } from "express";
import {
  likeTrack,
  unlikeTrack,
  getLikedTracks,
  checkTrackLiked,
} from "../controllers/liked-track.controller";
import { validateRequest } from "../middlewares/validateRequest";
import { likeTrackRequestSchema } from "../middlewares/liked-track.validation";
import { authenticateWithSession } from "../middlewares/authenticate";

const router = Router();

// Like a track
router.post(
  "/",
  authenticateWithSession,
  validateRequest(likeTrackRequestSchema),
  likeTrack,
);

// Unlike a track
router.delete(
  "/",
  authenticateWithSession,
  validateRequest(likeTrackRequestSchema),
  unlikeTrack,
);

// Get all liked tracks for current user
router.get("/", authenticateWithSession, getLikedTracks);

// Check if a specific track is liked
router.get("/:trackCode/status", authenticateWithSession, checkTrackLiked);

export default router;
