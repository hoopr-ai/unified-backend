import { Router } from "express";
import {
  getFaqSections,
  createFaqSection,
  updateFaqSection,
  deleteFaqSection,
  reorderFaqSections,
} from "../controllers/faq-section.controller";
import { validateRequest } from "../middlewares/validateRequest";
import {
  createFaqSectionRequestSchema,
  updateFaqSectionRequestSchema,
  reorderFaqSectionsRequestSchema,
} from "../middlewares/faq-section.validation";
import { authenticateWithSession } from "../middlewares/authenticate";
import { Platform, UserRoles } from "../services/dto-service/modules.export";

const router = Router();

// Public — fetch FAQ sections by platform
router.get("/", getFaqSections);

// Admin only — create / update / delete / reorder
router.post(
  "/",
  authenticateWithSession({
    roles: [UserRoles.ADMIN, UserRoles.SALES],
    platforms: [Platform.INTERNAL],
  }),
  validateRequest(createFaqSectionRequestSchema),
  createFaqSection
);

router.put(
  "/reorder",
  authenticateWithSession({
    roles: [UserRoles.ADMIN, UserRoles.SALES],
    platforms: [Platform.INTERNAL],
  }),
  validateRequest(reorderFaqSectionsRequestSchema),
  reorderFaqSections
);

router.put(
  "/:id",
  authenticateWithSession({
    roles: [UserRoles.ADMIN, UserRoles.SALES],
    platforms: [Platform.INTERNAL],
  }),
  validateRequest(updateFaqSectionRequestSchema),
  updateFaqSection
);

router.delete(
  "/:id",
  authenticateWithSession({
    roles: [UserRoles.ADMIN, UserRoles.SALES],
    platforms: [Platform.INTERNAL],
  }),
  deleteFaqSection
);

export default router;
