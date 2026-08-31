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
  getNativeUtmOverview,
  getNativeUtmBreakdown,
  getNativeUtmTimeseries,
  getNativeUtmDetail,
  getNativeUtmHygiene,
  getNativeUtmValues,
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

// The UTM dashboard is gated SEPARATELY, on `utm-analytics`.
//
// Not because the data is more sensitive — it is the same session table — but
// because the audience is different. Marketing needs the campaign dashboard and
// has no reason to hold the raw session explorer; engineering holds
// native-analytics and does not need campaign spend. One grant covering both
// would mean every campaign manager gets a per-visitor journey viewer thrown in.
const requireUtmDashboard = [
  authenticateWithSession({ platforms: [Platform.INTERNAL] }),
  requireFunctionality("utm-analytics"),
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

// ─── UTM & campaign analytics ───────────────────────────────────────────────
//
// Declared BEFORE /sessions/:id would ever be reached, and under their own
// /utm prefix, so none of these can be captured by the session id route.
//
// All six read the same native_sessions table the views above do; what makes
// them a separate dashboard is that they carry a session through to a signup
// and to money, keyed on first touch by visitor. See utm.service.ts for the
// attribution model — it is not obvious, and reading these numbers without it
// will produce wrong conclusions about which campaign paid for itself.
// The same handler as /filter-options above, exposed a second time under the
// /utm prefix so it is reachable with the utm-analytics grant alone. Without
// this, a marketing user who holds only that grant gets a 403 on the platform
// dropdowns and sees them silently empty — the filter bar would look broken
// rather than restricted.
router.get("/utm/filter-options", ...requireUtmDashboard, getNativeFilterOptions);

router.get("/utm/overview", ...requireUtmDashboard, getNativeUtmOverview);
router.get("/utm/breakdown", ...requireUtmDashboard, getNativeUtmBreakdown);
router.get("/utm/timeseries", ...requireUtmDashboard, getNativeUtmTimeseries);
router.get("/utm/detail", ...requireUtmDashboard, getNativeUtmDetail);
router.get("/utm/hygiene", ...requireUtmDashboard, getNativeUtmHygiene);
router.get("/utm/values", ...requireUtmDashboard, getNativeUtmValues);

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
