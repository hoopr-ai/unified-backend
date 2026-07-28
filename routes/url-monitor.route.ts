import { Router } from "express";
import { authenticateWithSession } from "../middlewares/authenticate";
import { requireFunctionality } from "../middlewares/requireFunctionality";
import { validateRequest } from "../middlewares/validateRequest";
import { Platform } from "../services/dto-service/modules.export";
import {
  createMonitoredUrlSchema,
  updateMonitoredUrlSchema,
} from "../middlewares/url-monitor.validation";
import {
  listMonitoredUrls,
  createMonitoredUrl,
  updateMonitoredUrl,
  deleteMonitoredUrl,
  checkMonitoredUrlNow,
  getMonitoredUrlHistory,
} from "../controllers/url-monitor.controller";

const router = Router();

// Require an INTERNAL-platform session, then a `url-monitoring` grant. Admins
// pass the grant check by role; other internal users need the functionality
// assigned (same id the internal-fe Tech Tools card/route are gated by).
const requireUrlMonitoring = [
  authenticateWithSession({ platforms: [Platform.INTERNAL] }),
  requireFunctionality("url-monitoring"),
];

router.get("/", ...requireUrlMonitoring, listMonitoredUrls);

router.post(
  "/",
  ...requireUrlMonitoring,
  validateRequest(createMonitoredUrlSchema),
  createMonitoredUrl
);

router.put(
  "/:id",
  ...requireUrlMonitoring,
  validateRequest(updateMonitoredUrlSchema),
  updateMonitoredUrl
);

router.delete("/:id", ...requireUrlMonitoring, deleteMonitoredUrl);

// Run a check immediately (health + SSL) and return the refreshed row.
router.post("/:id/check", ...requireUrlMonitoring, checkMonitoredUrlNow);

// Check history for the response-time / uptime charts.
router.get("/:id/history", ...requireUrlMonitoring, getMonitoredUrlHistory);

export default router;
