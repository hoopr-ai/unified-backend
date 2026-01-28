import { Router } from "express";
import { getAllFilters } from "../controllers/filter.controller";

const router = Router();

router.get("/", getAllFilters);

export default router;
