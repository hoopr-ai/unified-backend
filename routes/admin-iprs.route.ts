import { Router } from "express";
import { authenticateWithSession } from "../middlewares/authenticate";
import { requireFunctionality } from "../middlewares/requireFunctionality";
import { Platform } from "../services/dto-service/modules.export";
import {
  getIprsOverview,
  getIprsTrend,
  listIprsLicenses,
  listIprsOwners,
  listIprsBrands,
  listIprsTracks,
  listIprsDeals,
  getIprsFilters,
  downloadIprsLicenses,
  downloadIprsOwners,
  downloadIprsBrands,
  downloadIprsTracks,
  downloadIprsDeals,
} from "../controllers/admin-iprs.controller";

const router = Router();

// Read-only royalty reporting for the internal-fe Smash → IPRS module.
// Requires an INTERNAL-platform session plus the `iprs` grant (admins pass the
// grant check by role) — same gating shape as /admin/pay-per-track.
//
// GET-only by design: this module reports on the royalty position, it never
// changes it. Owner percentages are edited in Music Ingestion, deal pricing in
// Smash Tokens.
const requireIprs = [
  authenticateWithSession({ platforms: [Platform.INTERNAL] }),
  requireFunctionality("iprs"),
];

router.get("/overview", ...requireIprs, getIprsOverview);
router.get("/trend", ...requireIprs, getIprsTrend);
router.get("/filters", ...requireIprs, getIprsFilters);

// Each `/download` is declared before its list route so the more specific path
// wins — Express matches in declaration order.
router.get("/licenses/download", ...requireIprs, downloadIprsLicenses);
router.get("/licenses", ...requireIprs, listIprsLicenses);

router.get("/owners/download", ...requireIprs, downloadIprsOwners);
router.get("/owners", ...requireIprs, listIprsOwners);

router.get("/brands/download", ...requireIprs, downloadIprsBrands);
router.get("/brands", ...requireIprs, listIprsBrands);

router.get("/tracks/download", ...requireIprs, downloadIprsTracks);
router.get("/tracks", ...requireIprs, listIprsTracks);

router.get("/deals/download", ...requireIprs, downloadIprsDeals);
router.get("/deals", ...requireIprs, listIprsDeals);

export default router;
