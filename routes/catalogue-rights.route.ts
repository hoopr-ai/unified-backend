import { Router } from "express";
import { authenticateWithSession } from "../middlewares/authenticate";
import { getMyCatalogueEntitlements } from "../controllers/admin-catalogue-rights.controller";

const router = Router();

// GET /catalogue-rights/me — what the signed-in brand's tokens actually permit,
// per catalogue. This is the read behind the "TOKENS ASSIGNED / WHAT'S
// INCLUDED" cards on My Subscription.
//
// No platform restriction and no functionality grant: this is a customer
// reading their own commercial terms, not a CMS surface. The brand is resolved
// from the session's user record inside the controller, so there is no id for a
// caller to tamper with.
router.get("/me", authenticateWithSession({}), getMyCatalogueEntitlements);

export default router;
