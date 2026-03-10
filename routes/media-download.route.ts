import { Router } from "express";
import {
  queueDownload,
  getDownloadStatus,
  getStats,
} from "../controllers/media-download.controller";

const router = Router();

// Queue a new download job
// POST /media-download
// Body: { url: string, platform?: "instagram" | "youtube" | "tiktok" }
router.post("/", queueDownload);

// Get job status by jobId
// GET /media-download/status/:jobId
router.get("/status/:jobId", getDownloadStatus);

// Get queue statistics (for monitoring)
// GET /media-download/stats
router.get("/stats", getStats);

export default router;
