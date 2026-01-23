import { Router } from "express";
import { getAllPlaylists } from "../controllers/playlist.controller";

const router = Router();

router.get("/", getAllPlaylists);

export default router;
