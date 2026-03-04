import { Router } from "express";
import { recordStream, getStreamHistory } from "../controllers/stream-history.controller";
import { authenticateWithSession } from "../middlewares/authenticate";

const router = Router();

// Record a stream event (preview or play)
router.post("/", authenticateWithSession, recordStream);

// Get current user's stream history
router.get("/", authenticateWithSession, getStreamHistory);

export default router;
