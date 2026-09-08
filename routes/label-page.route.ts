import { Router } from "express";
import {
  getLabelPages,
  getLabelPageBySlugOrId,
  createLabelPage,
  updateLabelPage,
  deleteLabelPage,
  uploadLabelPageImage,
} from "../controllers/label-page.controller";
import { authenticateWithSession, optionalAuthenticate } from "../middlewares/authenticate";
import { singleImageUpload } from "../middlewares/image-upload";
import { UserRoles } from "../services/dto-service/modules.export";

const router = Router();

// Admin-only auth for CMS mutations (matches the rails/web-banners pattern —
// a label page is composed of rails, so it carries the same grant).
const adminAuth = authenticateWithSession({ roles: [UserRoles.ADMIN, UserRoles.MUSIC] });

// ─── CMS write-side (admin/music) ────────────────────────────────────────────
// Declared before "/:idOrSlug" so the literal-segment routes resolve first.
router.post("/", adminAuth, createLabelPage);
router.post("/:id/image", adminAuth, singleImageUpload, uploadLabelPageImage);
router.put("/:id", adminAuth, updateLabelPage);
router.delete("/:id", adminAuth, deleteLabelPage);

// ─── Read-side (public) ───────────────────────────────────────────────────────
// optionalAuthenticate only so a tagged visit can be attributed to the visitor
// who made it; it never rejects, and the listing itself is unchanged for
// anyone signed out.
router.get("/", optionalAuthenticate, getLabelPages);
router.get("/:idOrSlug", getLabelPageBySlugOrId);

export default router;
