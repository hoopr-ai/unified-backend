import { Router } from "express";
import { getOccasions } from "../controllers/occasion.controller";

const router = Router();

router.get("/", getOccasions);

export default router;
