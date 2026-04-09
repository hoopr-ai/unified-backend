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

const router = Router();

// Public — fetch FAQ sections by platform
router.get("/", getFaqSections);

// Admin only — create / update / delete / reorder
router.post(
  "/",
  // authenticateWithSession,
  validateRequest(createFaqSectionRequestSchema),
  createFaqSection
);

router.put(
  "/reorder",
  // authenticateWithSession,
  validateRequest(reorderFaqSectionsRequestSchema),
  reorderFaqSections
);

router.put(
  "/:id",
  // authenticateWithSession,
  validateRequest(updateFaqSectionRequestSchema),
  updateFaqSection
);

router.delete(
  "/:id",
  // authenticateWithSession,
  deleteFaqSection
);

export default router;
