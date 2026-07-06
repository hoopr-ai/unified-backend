import { Router } from "express";
import Joi from "joi";
import { authenticateWithSession } from "../middlewares/authenticate";
import { validateRequest } from "../middlewares/validateRequest";
import { trackJourneyEvent } from "../controllers/journey.controller";
import { JourneyEventName, UserRoles } from "../services/dto-service/modules.export";

const router = Router();

const journeyEventSchema = Joi.object({
  eventName: Joi.string()
    .valid(...Object.values(JourneyEventName))
    .required(),
  metadata: Joi.object().unknown(true).optional(),
}).unknown(false);

// FE reports UI-only checkout steps (form opened, prefilled, continued, …)
router.post(
  "/event",
  authenticateWithSession({ roles: [UserRoles.USER, UserRoles.ADMIN] }),
  validateRequest(journeyEventSchema),
  trackJourneyEvent,
);

export default router;
