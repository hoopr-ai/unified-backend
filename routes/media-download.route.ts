import { Router } from "express";
import {
  queueDownload,
  getDownloadStatus,
  getStats,
  extractInstagram,
} from "../controllers/media-download.controller";

const router = Router();

// Extract media from URLs (instant response)
// POST /media-download
// Body: { url?: string, urls?: string[], limit?: number, platform?: string }
// - url/urls: Single URL or array of URLs (posts, reels, or profile URLs)
// - limit: Max reels to fetch from profile (default: 10, max: 50)
// - Profile URLs auto-detected: returns top N reels with download links
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
