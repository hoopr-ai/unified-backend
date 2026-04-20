import { Router } from "express";
import {
  getFaqs,
  createFaq,
  updateFaq,
  deleteFaq,
  reorderFaqs,
} from "../controllers/faq.controller";
import { validateRequest } from "../middlewares/validateRequest";
import {
  createFaqRequestSchema,
  updateFaqRequestSchema,
  reorderFaqsRequestSchema,
} from "../middlewares/faq.validation";
import { authenticateWithSession } from "../middlewares/authenticate";
import { Platform, UserRoles } from "../services/dto-service/modules.export";

const router = Router();

// Public — fetch FAQs by platform (and optionally sectionId)
router.get("/", getFaqs);

// Admin only — create / update / delete / reorder
router.post(
  "/",
  authenticateWithSession({
    roles: [UserRoles.ADMIN, UserRoles.SALES],
    platforms: [Platform.INTERNAL],
  }),
  validateRequest(createFaqRequestSchema),
  createFaq
);

router.put(
  "/reorder",
  authenticateWithSession({
    roles: [UserRoles.ADMIN, UserRoles.SALES],
    platforms: [Platform.INTERNAL],
  }),
  validateRequest(reorderFaqsRequestSchema),
  reorderFaqs
);

router.put(
  "/:id",
  authenticateWithSession({
    roles: [UserRoles.ADMIN, UserRoles.SALES],
    platforms: [Platform.INTERNAL],
  }),
  validateRequest(updateFaqRequestSchema),
  updateFaq
);

router.delete(
  "/:id",
  authenticateWithSession({
    roles: [UserRoles.ADMIN, UserRoles.SALES],
    platforms: [Platform.INTERNAL],
  }),
  deleteFaq
);

export default router;
