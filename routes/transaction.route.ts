import { Router } from "express";
import Joi from "joi";
import { authenticateWithSession } from "../middlewares/authenticate";
import { validateRequest } from "../middlewares/validateRequest";
import { initTransaction, commitTransaction, getTransactions, getTransactionDetail, downloadInvoice, razorpayWebhook } from "../controllers/transaction.controller";

const router = Router();

const commitSchema = Joi.object({
  razorpayOrderId: Joi.string().required(),
  razorpayPaymentId: Joi.string().required(),
  razorpaySignature: Joi.string().required(),
});

// Razorpay server-to-server callback — must stay above the session auth
// middleware; authenticated by webhook signature instead.
router.post("/webhook", razorpayWebhook);

router.use(authenticateWithSession);

router.get("/", getTransactions);
router.get("/:id/invoice", downloadInvoice);
router.get("/:id", getTransactionDetail);
router.post("/init", initTransaction);
router.post("/commit", validateRequest(commitSchema), commitTransaction);

export default router;
