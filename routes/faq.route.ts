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

const router = Router();

// Public — fetch FAQs by platform (and optionally sectionId)
router.get("/", getFaqs);

// Admin only — create / update / delete / reorder
router.post(
  "/",
  // authenticateWithSession,
  validateRequest(createFaqRequestSchema),
  createFaq
);

router.put(
  "/reorder",
  // authenticateWithSession,
  validateRequest(reorderFaqsRequestSchema),
  reorderFaqs
);

router.put(
  "/:id",
  // authenticateWithSession,
  validateRequest(updateFaqRequestSchema),
  updateFaq
);

router.delete(
  "/:id",
  // authenticateWithSession,
  deleteFaq
);

export default router;
