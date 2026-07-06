import { Router } from "express";
import { authenticateWithSession } from "../middlewares/authenticate";
import { requireFunctionality } from "../middlewares/requireFunctionality";
import { Platform } from "../services/dto-service/modules.export";
import {
  getOverview,
  getSignupsSummary,
  listSignups,
  getCartsSummary,
  listCarts,
  listOrders,
  getOrderDetail,
  getTransactionsSummary,
  listTransactions,
  getFunnel,
  listFunnelDropped,
  getTopTracks,
  getCustomersSummary,
  listCustomers,
  getEngagementSummary,
  getUserDetail,
  listUserActivity,
} from "../controllers/admin-pay-per-track.controller";

const router = Router();

// Read-only analytics for the internal-fe Pay Per Track dashboard. Requires an
// INTERNAL-platform session plus the `pay-per-track-dashboard` grant (admins
// pass the grant check by role) — same gating shape as /admin/skus.
const requirePptDashboard = [
  authenticateWithSession({ platforms: [Platform.INTERNAL] }),
  requireFunctionality("pay-per-track-dashboard"),
];

router.get("/overview", ...requirePptDashboard, getOverview);

router.get("/signups/summary", ...requirePptDashboard, getSignupsSummary);
router.get("/signups", ...requirePptDashboard, listSignups);

router.get("/carts/summary", ...requirePptDashboard, getCartsSummary);
router.get("/carts", ...requirePptDashboard, listCarts);

router.get("/orders", ...requirePptDashboard, listOrders);
router.get("/orders/:id", ...requirePptDashboard, getOrderDetail);

router.get(
  "/transactions/summary",
  ...requirePptDashboard,
  getTransactionsSummary,
);
router.get("/transactions", ...requirePptDashboard, listTransactions);

router.get("/funnel/dropped", ...requirePptDashboard, listFunnelDropped);
router.get("/funnel", ...requirePptDashboard, getFunnel);

router.get("/tracks/top", ...requirePptDashboard, getTopTracks);

router.get("/customers/summary", ...requirePptDashboard, getCustomersSummary);
router.get("/customers", ...requirePptDashboard, listCustomers);

router.get(
  "/engagement/summary",
  ...requirePptDashboard,
  getEngagementSummary,
);

router.get("/users/:id/activity", ...requirePptDashboard, listUserActivity);
router.get("/users/:id", ...requirePptDashboard, getUserDetail);

export default router;
