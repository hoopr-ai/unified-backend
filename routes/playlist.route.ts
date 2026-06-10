import { Router } from "express";
import {
  getAllPlaylists,
  getPlaylistDetail,
  searchPlaylists,
  createPlaylist,
  updatePlaylist,
  setPlaylistTracks,
  archivePlaylist,
  uploadPlaylistImage,
} from "../controllers/playlist.controller";
import {
  authenticateWithSession,
  optionalAuthenticate,
} from "../middlewares/authenticate";
import { singleImageUpload } from "../middlewares/image-upload";
import { UserRoles } from "../services/dto-service/modules.export";

const router = Router();

// Admin-only auth for CMS mutations (matches the rails module pattern)
const adminAuth = authenticateWithSession({ roles: [UserRoles.ADMIN, UserRoles.MUSIC] });

// ─── Read-side (public / user-aware) ─────────────────────────────────────────
router.get("/", optionalAuthenticate, getAllPlaylists);
router.get("/search", searchPlaylists);

// ─── CMS write-side (admin/music) ────────────────────────────────────────────
// Declared before "/:playlistCode" so the literal-segment routes resolve first.
router.post("/", adminAuth, createPlaylist);
router.put("/:id/tracks", adminAuth, setPlaylistTracks);
router.post("/:id/image", adminAuth, singleImageUpload, uploadPlaylistImage);
router.put("/:id", adminAuth, updatePlaylist);
router.delete("/:id", adminAuth, archivePlaylist);

router.get("/:playlistCode", optionalAuthenticate, getPlaylistDetail);

export default router;
