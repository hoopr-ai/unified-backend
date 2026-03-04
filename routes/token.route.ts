import { Router } from "express";
import { getTokenDetails } from "../controllers/token.controller";
import { authenticateWithSession } from "../middlewares/authenticate";
import { UserRoles } from "../services/dto-service/modules.export";

const router = Router();

// Get all token details - requires authenticated user
router.get(
  "/details",
  authenticateWithSession({ roles: [UserRoles.USER, UserRoles.ADMIN] }),
  getTokenDetails,
);

export default router;
