import { Router } from "express";
import { authenticateWithSession } from "../middlewares/authenticate";
import { requireFunctionality } from "../middlewares/requireFunctionality";
import { Platform } from "../services/dto-service/modules.export";
import {
  getCreatorFunnel,
  getCreatorFunnelTimeseries,
  getCreatorPlatform,
  getCreatorBreakdown,
  getCreatorMeta,
  getCreatorDetail,
  exportCreatorDetail,
} from "../controllers/admin-creator-analytics.controller";

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

// Anonymous visitor → signup → subscription → first payment, plus renewals and
// revenue beside it. See funnel.service.ts for why renewals are NOT a rung.
router.get("/funnel", ...requireDashboard, getCreatorFunnel);
router.get("/funnel/timeseries", ...requireDashboard, getCreatorFunnelTimeseries);

// Every tile on the Activity view, and one metric grouped by one dimension.
router.get("/platform", ...requireDashboard, getCreatorPlatform);
router.get("/breakdown", ...requireDashboard, getCreatorBreakdown);

// The rows behind any tile. `/detail/export` is declared BEFORE `/detail` would
// swallow it — Express matches in declaration order, and a static suffix on a
// shared prefix has to come first.
router.get("/detail/export", ...requireDashboard, exportCreatorDetail);
router.get("/detail", ...requireDashboard, getCreatorDetail);

export default router;
