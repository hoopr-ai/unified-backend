import { Router } from "express";
import {
  getQuickAdds,
  getQuickAddByIdOrCode,
  createQuickAdd,
  updateQuickAdd,
  deleteQuickAdd,
  uploadQuickAddImage,
} from "../controllers/quick-add.controller";
import { authenticateWithSession } from "../middlewares/authenticate";
import { singleImageUpload } from "../middlewares/image-upload";
import { UserRoles } from "../services/dto-service/modules.export";

const router = Router();

// Admin-only auth for CMS mutations (matches the occasions/playlists/rails pattern)
const adminAuth = authenticateWithSession({ roles: [UserRoles.ADMIN, UserRoles.MUSIC] });

// ─── CMS write-side (admin/music) ────────────────────────────────────────────
// Declared before "/:idOrCode" so the literal-segment routes resolve first.
router.post("/", adminAuth, createQuickAdd);
router.post("/:id/image", adminAuth, singleImageUpload, uploadQuickAddImage);
router.put("/:id", adminAuth, updateQuickAdd);
router.delete("/:id", adminAuth, deleteQuickAdd);

// ─── Read-side (public) ───────────────────────────────────────────────────────
router.get("/", getQuickAdds);
router.get("/:idOrCode", getQuickAddByIdOrCode);

export default router;
