import { Router } from "express";
import { getFaqs, createFaq, updateFaq, deleteFaq } from "../controllers/faq.controller";
import { validateRequest } from "../middlewares/validateRequest";
import {
  createFaqRequestSchema,
  updateFaqRequestSchema,
} from "../middlewares/faq.validation";
import { authenticateWithSession } from "../middlewares/authenticate";
import { UserRoles } from "../services/dto-service/modules.export";
import { Platform } from "../services/dto-service/constants/common.enums";

const router = Router();

// Public — fetch FAQs by platform (and optionally section)
router.get(
  "/",
  getFaqs
);

// Admin only — create / update / delete
router.post(
  "/",
  authenticateWithSession({ roles: [UserRoles.MASTER, UserRoles.ADMIN] }),
  validateRequest(createFaqRequestSchema),
  createFaq
);

router.put(
  "/:id",
  authenticateWithSession({ roles: [UserRoles.MASTER, UserRoles.ADMIN] }),
  validateRequest(updateFaqRequestSchema),
  updateFaq
);

router.delete(
  "/:id",
  authenticateWithSession({ roles: [UserRoles.MASTER, UserRoles.ADMIN] }),
  deleteFaq
);

export default router;
