import { Router } from "express";
import { authenticateWithSession } from "../middlewares/authenticate";
import { requireFunctionality } from "../middlewares/requireFunctionality";
import { Platform } from "../services/dto-service/modules.export";
import {
  getWhitelistChannel,
  getWhitelistChannelHistory,
  getWhitelistChannels,
  getWhitelistChannelsCsv,
  getWhitelistChannelsMeta,
  getWhitelistClaim,
  getWhitelistClaimHistory,
  getWhitelistClaims,
  getWhitelistClaimsCsv,
  getWhitelistClaimsMeta,
  patchWhitelistChannel,
  patchWhitelistClaim,
} from "../controllers/admin-whitelisting.controller";

const router = Router();

// Channel Whitelisting — the ops CMS behind internal-fe's top-level
// /channel-whitelisting section. Two surfaces:
//
//   /channels   creators' submitted channels (YouTube, Instagram, Facebook),
//               newest first, with the subscription that entitles them and the
//               clearance status ops can move
//   /claims     creators' "please release the claim on this video" requests
//
// Requires an INTERNAL-platform session plus the `channel-whitelisting` grant
// (admins pass by role) — the same gating shape as /admin/native-analytics. The
// grant id must also exist in internal-fe's src/services/functionalities.ts,
// which is the catalogue the grant UI reads; the server deliberately does not
// validate ids, so an id missing there can never be assigned to anyone.
const requireDashboard = [
  authenticateWithSession({ platforms: [Platform.INTERNAL] }),
  requireFunctionality("channel-whitelisting"),
];

// ── Channel Whitelisting ────────────────────────────────────────────────────
//
// The literal segments ('meta', 'export') are declared BEFORE ':profileId' so
// Express cannot match them as an id and hand "meta" to a numeric validator as
// a 400.
router.get("/channels/meta", ...requireDashboard, getWhitelistChannelsMeta);
router.get("/channels/export", ...requireDashboard, getWhitelistChannelsCsv);
router.get("/channels", ...requireDashboard, getWhitelistChannels);
router.get("/channels/:profileId", ...requireDashboard, getWhitelistChannel);
router.get(
  "/channels/:profileId/history",
  ...requireDashboard,
  getWhitelistChannelHistory,
);
// PATCH, not PUT: this changes one field of workflow state. What the creator
// submitted is immutable — the record of what was actually filed is the point
// of storing it.
router.patch("/channels/:profileId", ...requireDashboard, patchWhitelistChannel);

// ── Claim Clearance ─────────────────────────────────────────────────────────
router.get("/claims/meta", ...requireDashboard, getWhitelistClaimsMeta);
router.get("/claims/export", ...requireDashboard, getWhitelistClaimsCsv);
router.get("/claims", ...requireDashboard, getWhitelistClaims);
router.get("/claims/:id", ...requireDashboard, getWhitelistClaim);
router.get("/claims/:id/history", ...requireDashboard, getWhitelistClaimHistory);
router.patch("/claims/:id", ...requireDashboard, patchWhitelistClaim);

export default router;
