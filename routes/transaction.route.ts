import { Router } from "express";
import Joi from "joi";
import { authenticateWithSession } from "../middlewares/authenticate";
import { validateRequest } from "../middlewares/validateRequest";
import { initTransaction, commitTransaction } from "../controllers/transaction.controller";

const router = Router();

const commitSchema = Joi.object({
  razorpayOrderId: Joi.string().required(),
  razorpayPaymentId: Joi.string().required(),
  razorpaySignature: Joi.string().required(),
});

router.use(authenticateWithSession);

router.post("/init", initTransaction);
router.post("/commit", validateRequest(commitSchema), commitTransaction);

export default router;
