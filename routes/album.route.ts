import { Router } from "express";
import { getAllAlbums, getAlbumTracks } from "../controllers/album.controller";
import { authenticate } from "../middlewares/authenticate";

const router = Router();

// POST /albums — list albums, optionally filtered by type[]
router.post("/", authenticate, getAllAlbums);

// GET /albums/:albumId/tracks — paginated tracks for an album
router.get("/:albumId/tracks", authenticate, getAlbumTracks);

export default router;
