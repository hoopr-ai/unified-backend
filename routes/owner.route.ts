import { Router } from "express";
import { getAllOwners, searchOwners } from "../controllers/owner.controller";

const router = Router();

router.get("/", getAllOwners);
router.get("/search", searchOwners);

export default router;
