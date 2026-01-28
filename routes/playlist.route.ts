import { Router } from "express";
import {
  getAllPlaylists,
  getPlaylistDetail,
} from "../controllers/playlist.controller";

const router = Router();

router.get("/", getAllPlaylists);
router.get("/:playlistCode", getPlaylistDetail);

export default router;
