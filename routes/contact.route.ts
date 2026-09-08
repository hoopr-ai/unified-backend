import { Router } from "express";
import { contactUs } from "../controllers/contact.controller";
import { optionalAuthenticate } from "../middlewares/authenticate";

const router = Router();

// Contact Us — PUBLIC. The form sits on pages a signed-out visitor can reach,
// so requiring a token would defeat it. `optionalAuthenticate` attaches the
// session when a token happens to be present and passes through cleanly when
// it is not, which is what lets the controller stamp the submitter's real
// platform instead of assuming one.
//
// (The comment here used to say "requires authenticated user" and imported
// authenticateWithSession without ever applying it — the route has always been
// anonymous, as the `anonymous_activity` log lines show.)
router.post("/", optionalAuthenticate, contactUs);

export default router;
