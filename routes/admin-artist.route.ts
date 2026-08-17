import { Router } from "express";
import { authenticateWithSession } from "../middlewares/authenticate";
import {
  Platform,
  UserRoles,
} from "../services/dto-service/modules.export";
import {
  getNativeArtistStatus,
  recomputeNativeArtists,
} from "../controllers/admin-artist.controller";

const router = Router();

// Admin-only, INTERNAL platform. Gated by role rather than by a functionality
// grant on purpose: this is an operational maintenance trigger, not a CMS
// screen, so it needs no entry in the internal-fe functionality catalogue.
const requireInternalAdmin = authenticateWithSession({
  platforms: [Platform.INTERNAL],
  roles: [UserRoles.ADMIN],
});

router.get("/native-status", requireInternalAdmin, getNativeArtistStatus);

// Recompute now. The nightly cron does the same work unattended; this exists so
// a catalogue import can be reflected without waiting for it.
router.post("/recompute-native", requireInternalAdmin, recomputeNativeArtists);

export default router;
