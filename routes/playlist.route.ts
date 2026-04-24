import { Router } from "express";
import {
  getAllPlaylists,
  getPlaylistDetail,
  searchPlaylists,
} from "../controllers/playlist.controller";
import { optionalAuthenticate } from "../middlewares/authenticate";

const router = Router();

router.get("/", optionalAuthenticate, getAllPlaylists);
router.get("/search", searchPlaylists);
router.get("/:playlistCode", optionalAuthenticate, getPlaylistDetail);

export default router;
