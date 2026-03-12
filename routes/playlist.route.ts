import { Router } from "express";
import {
  getAllPlaylists,
  getPlaylistDetail,
} from "../controllers/playlist.controller";
import { authenticate } from "../middlewares/authenticate";

const router = Router();

router.get("/", authenticate, getAllPlaylists);
router.get("/:playlistCode", authenticate, getPlaylistDetail);

export default router;
