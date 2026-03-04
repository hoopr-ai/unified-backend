import { Router } from "express";
import { getAllOwners } from "../controllers/owner.controller";

const router = Router();

router.get("/", getAllOwners);

export default router;
