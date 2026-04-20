import { Router } from "express";
import { contactUs } from "../controllers/contact.controller";
import { authenticateWithSession } from "../middlewares/authenticate";
import { UserRoles } from "../services/dto-service/modules.export";

const router = Router();

// Contact Us - requires authenticated user
router.post("/", contactUs);

export default router;
