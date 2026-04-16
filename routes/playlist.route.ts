import { Router } from "express";
import {
  getAllPlaylists,
  getPlaylistDetail,
} from "../controllers/playlist.controller";
import { optionalAuthenticate } from "../middlewares/authenticate";

const router = Router();

router.get("/", optionalAuthenticate, getAllPlaylists);
router.get("/:playlistCode", optionalAuthenticate, getPlaylistDetail);

export default router;
