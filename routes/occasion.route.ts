import { Router } from "express";
import { getOccasions, getTracksByOccasion } from "../controllers/occasion.controller";

const router = Router();

router.get("/", getOccasions);
router.get("/:occasionId/tracks", getTracksByOccasion);

export default router;
