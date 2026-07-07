import { Router } from "express";
import {
  getOccasions,
  getTracksByOccasion,
  createOccasion,
  updateOccasion,
  deleteOccasion,
  uploadOccasionImage,
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
router.put("/:id", adminAuth, updateOccasion);
router.delete("/:id", adminAuth, deleteOccasion);

// ─── Read-side (public) ───────────────────────────────────────────────────────
router.get("/", getOccasions);
router.get("/:occasionId/tracks", getTracksByOccasion);

export default router;
