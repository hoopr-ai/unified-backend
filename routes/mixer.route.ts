import { Router } from "express";
import {
  createMix,
  downloadMix,
  listMixes,
} from "../controllers/mixer.controller";
import { validateRequest } from "../middlewares/validateRequest";
import {
  createMixRequestSchema,
  downloadMixRequestSchema,
} from "../middlewares/mixer.validation";
import { authenticate } from "../middlewares/authenticate";

const router = Router();

// `authenticate`, not `optionalAuthenticate`: a mix is rendered from catalogue
// masters and stored against a user, so there is no anonymous read of it.
router.post("/mix", authenticate, validateRequest(createMixRequestSchema), createMix);
router.get("/downloads", authenticate, listMixes);
router.post(
  "/download",
  authenticate,
  validateRequest(downloadMixRequestSchema),
  downloadMix,
);

export default router;
