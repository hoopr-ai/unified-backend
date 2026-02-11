import { Router } from "express";
import {
  addVideoLink,
  getVideoLinks,
} from "../controllers/licenses.controller";
import { authenticateWithSession } from "../middlewares/authenticate";
import { UserRoles } from "../services/dto-service/modules.export";

const router = Router();

// Add video link - requires authenticated user
router.post(
  "/",
  authenticateWithSession({ roles: [UserRoles.USER, UserRoles.ADMIN] }),
  addVideoLink,
);

// Get video links by license ID - requires authenticated user
router.get(
  "/:licenseId",
  authenticateWithSession({ roles: [UserRoles.USER, UserRoles.ADMIN] }),
  getVideoLinks,
);

export default router;
