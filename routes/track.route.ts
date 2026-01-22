import { Router } from "express";
import { getAllTracks } from "../controllers/track.controller";

const router = Router();

router.get("/", getAllTracks);

export default router;
