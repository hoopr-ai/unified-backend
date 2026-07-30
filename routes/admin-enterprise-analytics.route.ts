import { Router } from "express";
import { authenticateWithSession } from "../middlewares/authenticate";
import { requireFunctionality } from "../middlewares/requireFunctionality";
import { Platform } from "../services/dto-service/modules.export";
import {
  getFounderOverview,
  getFounderTokenEconomics,
  getFounderFunnel,
  getFounderEngagement,
  getFounderMusic,
  getFounderRetention,
  getFounderHealthScores,
  getFounderTopUsers,
  getFounderTrackDownloaders,
  getFounderBrandsBreakdown,
  getFounderTokenBreakdown,
  getFounderRenewalBreakdown,
  getCsAccounts,
  getCsAlerts,
  getCsTokenAccounts,
  getLeads,
  getProductFunnel,
  getProductSearchInsights,
  getProductTokenSpend,
  getProductBehavior,
} from "../controllers/admin-enterprise-analytics.controller";

const router = Router();

// Read-only analytics for the internal-fe "Enterprise Analytics" dashboards
// (Founder / Customer Success / Product). Requires an INTERNAL-platform
// session plus the `enterprise-analytics` grant (admins pass by role) — same
// gating shape as /admin/pay-per-track.
const requireDashboard = [
  authenticateWithSession({ platforms: [Platform.INTERNAL] }),
  requireFunctionality("enterprise-analytics"),
];

router.get("/founder/overview", ...requireDashboard, getFounderOverview);
router.get("/founder/token-economics", ...requireDashboard, getFounderTokenEconomics);
router.get("/founder/funnel", ...requireDashboard, getFounderFunnel);
router.get("/founder/engagement", ...requireDashboard, getFounderEngagement);
router.get("/founder/music", ...requireDashboard, getFounderMusic);
router.get("/founder/retention", ...requireDashboard, getFounderRetention);
router.get("/founder/health-scores", ...requireDashboard, getFounderHealthScores);
router.get("/founder/top-users", ...requireDashboard, getFounderTopUsers);
router.get("/founder/music/track-downloaders", ...requireDashboard, getFounderTrackDownloaders);
router.get("/founder/brands-breakdown", ...requireDashboard, getFounderBrandsBreakdown);
router.get("/founder/token-breakdown", ...requireDashboard, getFounderTokenBreakdown);
router.get("/founder/renewal-breakdown", ...requireDashboard, getFounderRenewalBreakdown);

router.get("/cs/accounts", ...requireDashboard, getCsAccounts);
router.get("/cs/token-accounts", ...requireDashboard, getCsTokenAccounts);
router.get("/cs/alerts", ...requireDashboard, getCsAlerts);

router.get("/leads", ...requireDashboard, getLeads);

router.get("/product/funnel", ...requireDashboard, getProductFunnel);
router.get("/product/search", ...requireDashboard, getProductSearchInsights);
router.get("/product/token-spend", ...requireDashboard, getProductTokenSpend);
router.get("/product/behavior", ...requireDashboard, getProductBehavior);

export default router;
