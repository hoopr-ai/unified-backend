import { Router } from "express";
import { authenticateWithSession } from "../middlewares/authenticate";
import { requireFunctionality } from "../middlewares/requireFunctionality";
import { Platform } from "../services/dto-service/modules.export";
import {
  extendTrial,
  getTrialFunnel,
  getTrialJourney,
  getTrials,
  runTrialJourney,
} from "../controllers/admin-smash-trials.controller";

const router = Router();

// Smash 7-day trials — internal-fe admin panel. INTERNAL session plus the
// `smash-trials` grant (admins pass by role), same shape as /admin/whitelisting.
// The grant id must also be added to internal-fe's src/services/functionalities.ts
// or it can never be assigned; holding it is what "authority to grant the +2
// extension" means.
const requireTrialsConsole = [
  authenticateWithSession({ platforms: [Platform.INTERNAL] }),
  requireFunctionality("smash-trials"),
];

router.get("/", ...requireTrialsConsole, getTrials);
router.get("/funnel", ...requireTrialsConsole, getTrialFunnel);
router.post("/journey/run", ...requireTrialsConsole, runTrialJourney);
router.get("/:brandId/journey", ...requireTrialsConsole, getTrialJourney);
router.post("/:brandId/extend", ...requireTrialsConsole, extendTrial);

export default router;
