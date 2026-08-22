import { Router } from "express";
import { authenticateWithSession } from "../middlewares/authenticate";
import { requireFunctionality } from "../middlewares/requireFunctionality";
import { Platform } from "../services/dto-service/modules.export";
import {
  getNativeOverview,
  getNativeTimeseries,
  getNativePlatforms,
  getNativeGeography,
  getNativeAcquisition,
  getNativeTechHealth,
  getNativeRetention,
  getNativePages,
  getNativeEvents,
  getNativeFunnel,
  getNativeSessions,
  getNativeSessionDetail,
  getNativeVisitorSessions,
  getNativeFilterOptions,
} from "../controllers/admin-native-analytics.controller";

const router = Router();

// Read-only analytics over the session/event data NATIVE-BE records for
// creator-web and creator-mobile, including anonymous visitors.
//
// Requires an INTERNAL-platform session plus the `native-analytics` grant
// (admins pass by role) — the same gating shape as /admin/enterprise-analytics.
// The grant id must also exist in internal-fe's src/services/functionalities.ts,
// which is the catalogue the grant UI reads; the server deliberately does not
// validate ids, so an id missing there can never be assigned to anyone.
const requireDashboard = [
  authenticateWithSession({ platforms: [Platform.INTERNAL] }),
  requireFunctionality("native-analytics"),
];

// Populates the three filter dropdowns from values actually present in the data.
router.get("/filter-options", ...requireDashboard, getNativeFilterOptions);

// Aggregates — rollup-backed, so these work over unbounded history.
router.get("/overview", ...requireDashboard, getNativeOverview);
router.get("/timeseries", ...requireDashboard, getNativeTimeseries);
router.get("/platforms", ...requireDashboard, getNativePlatforms);
router.get("/geography", ...requireDashboard, getNativeGeography);
router.get("/acquisition", ...requireDashboard, getNativeAcquisition);
router.get("/pages", ...requireDashboard, getNativePages);
router.get("/events", ...requireDashboard, getNativeEvents);
router.get("/funnel", ...requireDashboard, getNativeFunnel);
router.get("/retention", ...requireDashboard, getNativeRetention);
router.get("/tech", ...requireDashboard, getNativeTechHealth);

// Session drill-down — raw rows. The list and one session's detail are always
// available (native_sessions is never pruned); a timeline older than the raw
// retention window comes back empty with the archive location instead.
//
// The static /sessions route is declared BEFORE /sessions/:id so Express cannot
// match the literal path as an id.
router.get("/sessions", ...requireDashboard, getNativeSessions);
router.get("/sessions/:id", ...requireDashboard, getNativeSessionDetail);
router.get("/visitors/:visitorId", ...requireDashboard, getNativeVisitorSessions);

export default router;
