import { Router } from "express";
import {
  getOccasions,
  getOccasionByIdOrCode,
  getTracksByOccasion,
  createOccasion,
  updateOccasion,
  deleteOccasion,
  uploadOccasionImage,
  getOccasionCuratedTracks,
  setOccasionTracks,
} from "../controllers/occasion.controller";
import { authenticateWithSession } from "../middlewares/authenticate";
import { singleImageUpload } from "../middlewares/image-upload";
import { UserRoles } from "../services/dto-service/modules.export";

const router = Router();

// Admin-only auth for CMS mutations (matches the playlists/rails module pattern)
const adminAuth = authenticateWithSession({ roles: [UserRoles.ADMIN, UserRoles.MUSIC] });

// ─── CMS write-side (admin/music) ────────────────────────────────────────────
// Declared before "/:occasionId" so the literal-segment routes resolve first.
router.post("/", adminAuth, createOccasion);
router.post("/:id/image", adminAuth, singleImageUpload, uploadOccasionImage);
router.get("/:id/curated-tracks", adminAuth, getOccasionCuratedTracks);
router.put("/:id/tracks", adminAuth, setOccasionTracks);
router.put("/:id", adminAuth, updateOccasion);
router.delete("/:id", adminAuth, deleteOccasion);

// ─── Read-side (public) ───────────────────────────────────────────────────────
router.get("/", getOccasions);
router.get("/:occasionId/tracks", getTracksByOccasion);
// Single-occasion detail — by numeric id OR occasionCode slug. Declared after
// the literal/two-segment routes above; distinct segment count from those, so
// no ordering conflict.
router.get("/:idOrCode", getOccasionByIdOrCode);

export default router;
