import { Router } from "express";
import {
  getWebBanners,
  getWebBannerByIdOrCode,
  createWebBanner,
  updateWebBanner,
  deleteWebBanner,
  uploadWebBannerImage,
} from "../controllers/web-banner.controller";
import { authenticateWithSession } from "../middlewares/authenticate";
import { singleImageUpload } from "../middlewares/image-upload";
import { UserRoles } from "../services/dto-service/modules.export";

const router = Router();

// Admin-only auth for CMS mutations (matches the occasions/quick-adds/rails pattern)
const adminAuth = authenticateWithSession({ roles: [UserRoles.ADMIN, UserRoles.MUSIC] });

// ─── CMS write-side (admin/music) ────────────────────────────────────────────
// Declared before "/:idOrCode" so the literal-segment routes resolve first.
router.post("/", adminAuth, createWebBanner);
router.post("/:id/image", adminAuth, singleImageUpload, uploadWebBannerImage);
router.put("/:id", adminAuth, updateWebBanner);
router.delete("/:id", adminAuth, deleteWebBanner);

// ─── Read-side (public) ───────────────────────────────────────────────────────
router.get("/", getWebBanners);
router.get("/:idOrCode", getWebBannerByIdOrCode);

export default router;
