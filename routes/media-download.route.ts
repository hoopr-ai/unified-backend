import { Router } from "express";
import {
  queueDownload,
  getDownloadStatus,
  getStats,
  extractInstagram,
} from "../controllers/media-download.controller";

const router = Router();

// Queue a new download job
// POST /media-download
// Body: { url: string, platform?: "instagram" | "youtube" | "tiktok" }
router.post("/", queueDownload);

// Direct Instagram extraction (no queue, instant response)
// POST /media-download/instagram
// Body: { url: string }
router.post("/instagram", extractInstagram);

// Get job status by jobId
// GET /media-download/status/:jobId
router.get("/status/:jobId", getDownloadStatus);

// Get queue statistics (for monitoring)
// GET /media-download/stats
router.get("/stats", getStats);

export default router;
