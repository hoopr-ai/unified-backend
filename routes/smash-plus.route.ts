import { Router } from "express";
import { submitSmashPlusBrief } from "../controllers/smash-plus.controller";
import { optionalAuthenticate } from "../middlewares/authenticate";

const router = Router();

// Smash Plus landing page (/smash-plus) — PUBLIC. The page opens signed out, so
// the brief form must work with or without a token. `optionalAuthenticate`
// attaches the session when a valid one is sent (the brief is then linked to
// that user and brand) and passes through cleanly when it is absent or bad.
router.post("/brief", optionalAuthenticate, submitSmashPlusBrief);

export default router;
