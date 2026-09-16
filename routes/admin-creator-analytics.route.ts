import { Router } from "express";
import { authenticateWithSession } from "../middlewares/authenticate";
import { requireFunctionality } from "../middlewares/requireFunctionality";
import { Platform } from "../services/dto-service/modules.export";
import {
  getCreatorFunnel,
  getCreatorFunnelTimeseries,
  getCreatorWebFunnel,
  getCreatorEventHealth,
  getCreatorPlatform,
  getCreatorBreakdown,
  getCreatorMeta,
  getCreatorOverview,
  getCreatorDetail,
  exportCreatorDetail,
} from "../controllers/admin-creator-analytics.controller";
import {
  getPlgAudit,
  getPlgCatalogue,
  getPlgFunnel,
  getPlgInsights,
  getPlgJourney,
  getPlgPaths,
  getPlgPeople,
  getPlgRetention,
  getPlgStage,
  getPlgSubFunnel,
  getPlgTrend,
} from "../controllers/admin-plg-analytics.controller";

const router = Router();

// Read-only analytics over the whole Creator platform — the acquisition funnel
// and the activity underneath it — backing internal-fe's "Creator Users &
// Analytics" section at /creator/users.
//
// ── GATED ON `native-users`, NOT ON A NEW GRANT ────────────────────────────
//
// These endpoints report on exactly the population the Creator Users CMS lists,
// in aggregate, and every drill-down here is a subset of what that CMS already
// shows per person. Minting a second grant would mean the people who hold
// Creator Users see a section they cannot open, which reads as a broken page
// rather than as a restricted one — and there is nothing here they could not
// already assemble by paging that CMS.
//
// (The grant id must also exist in internal-fe's src/services/functionalities.ts,
// which is the catalogue the grant UI reads. It already does.)
const requireDashboard = [
  authenticateWithSession({ platforms: [Platform.INTERNAL] }),
  requireFunctionality("native-users"),
];

// The metric catalogue — tiles, drill-down columns, sort keys, and which
// metrics this environment can actually answer. The dashboard reads its shape
// from here rather than carrying a copy of the registry that drifts from it.
router.get("/meta", ...requireDashboard, getCreatorMeta);

// Point-in-time platform totals — catalogue size, people, lifetime activity and
// money. Takes no date range at all, which is the one thing that makes it
// different from every other view here rather than a duplicate of Activity.
router.get("/overview", ...requireDashboard, getCreatorOverview);

// Anonymous visitor → signup → subscription → first payment, plus renewals and
// revenue beside it. See funnel.service.ts for why renewals are NOT a rung.
router.get("/funnel", ...requireDashboard, getCreatorFunnel);

// The Creator Web PRODUCT funnel — what people did inside the app and which
// step lost them. Distinct from /funnel above, which is the acquisition view
// and counts a different unit: sessions and accounts rather than the same
// visitor moving through product stages.
router.get("/web-funnel", ...requireDashboard, getCreatorWebFunnel);

// Whether the pipeline behind that funnel is actually complete — which events
// are missing, which have gone quiet, and which required properties are only
// partly populated. Deliberately an endpoint rather than a report: a gap found
// during an analysis has already cost the analysis.
router.get("/event-health", ...requireDashboard, getCreatorEventHealth);
router.get("/funnel/timeseries", ...requireDashboard, getCreatorFunnelTimeseries);

// Every tile on the Activity view, and one metric grouped by one dimension.
router.get("/platform", ...requireDashboard, getCreatorPlatform);
router.get("/breakdown", ...requireDashboard, getCreatorBreakdown);

// The rows behind any tile. `/detail/export` is declared BEFORE `/detail` would
// swallow it — Express matches in declaration order, and a static suffix on a
// shared prefix has to come first.
router.get("/detail/export", ...requireDashboard, exportCreatorDetail);
router.get("/detail", ...requireDashboard, getCreatorDetail);

// ── Growth (PLG) ────────────────────────────────────────────────────────────
//
// The lifecycle funnel — traffic → activation → sign-up → intent → subscription
// → post-subscription activation — with its cohorts, sub-funnels, journeys,
// retention and insights. Same population and same grant as everything above;
// see services/business-service/creator-analytics/plg/plg-catalogue.ts for
// every definition.
router.get("/plg/catalogue", ...requireDashboard, getPlgCatalogue);
router.get("/plg/audit", ...requireDashboard, getPlgAudit);
router.get("/plg/funnel", ...requireDashboard, getPlgFunnel);
router.get("/plg/trend", ...requireDashboard, getPlgTrend);
router.get("/plg/stage", ...requireDashboard, getPlgStage);
router.get("/plg/subfunnel", ...requireDashboard, getPlgSubFunnel);
router.get("/plg/people", ...requireDashboard, getPlgPeople);
router.get("/plg/paths", ...requireDashboard, getPlgPaths);
router.get("/plg/journey", ...requireDashboard, getPlgJourney);
router.get("/plg/retention", ...requireDashboard, getPlgRetention);
router.get("/plg/insights", ...requireDashboard, getPlgInsights);

export default router;
