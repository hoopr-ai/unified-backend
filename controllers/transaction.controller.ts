import type { Response, Request } from "express";
import {
  catchAsync,
  sendResponse,
  sendError,
} from "../services/helper-service/modules.export";
import { HttpStatusCode } from "../services/dto-service/modules.export";
import {
  initTransactionService,
  commitTransactionService,
  getTransactionsService,
  getTransactionDetailService,
  downloadInvoiceService,
  handleRazorpayWebhookService,
  parseTransactionId,
} from "../services/business-service/transaction/transaction.service";
import type { SessionPayload } from "../middlewares/authenticate";

interface AuthRequest extends Request {
  session?: SessionPayload;
}

// PostgreSQL BIGINT columns come back from the pg driver as strings, so
// req.session.userId may be "508" (string) even though it's typed as number.
// Always coerce to number before passing to services.
const resolveUserId = (session?: SessionPayload): number | null => {
  const raw = session?.userId;
  if (raw === undefined || raw === null) return null;
  const n = Number(raw);
  return isNaN(n) ? null : n;
};

export const initTransaction = catchAsync(async (req: AuthRequest, res: Response) => {
  const userId = resolveUserId(req.session);
  const email = req.session?.email;
  if (!userId || !email) return sendError(res, HttpStatusCode.UNAUTHORIZED, "Unauthorized", {});

  const data = await initTransactionService(userId, email);
  sendResponse(res, { status: HttpStatusCode.OK, data, message: "Payment initiated" });
});

export const commitTransaction = catchAsync(async (req: AuthRequest, res: Response) => {
  const userId = resolveUserId(req.session);
  if (!userId) return sendError(res, HttpStatusCode.UNAUTHORIZED, "Unauthorized", {});

  const data = await commitTransactionService(userId, req.body);
  sendResponse(res, { status: HttpStatusCode.OK, data, message: "Payment successful" });
});

// Unauthenticated — called server-to-server by Razorpay. Authenticity comes
// from the HMAC signature over the raw body, verified in the service.
export const razorpayWebhook = catchAsync(async (req: Request, res: Response) => {
  const signatureHeader = req.headers["x-razorpay-signature"];
  const signature = Array.isArray(signatureHeader) ? signatureHeader[0] : signatureHeader;
  const rawBody = (req as any).rawBody as Buffer | undefined;

  if (!rawBody) {
    return sendError(res, HttpStatusCode.BAD_REQUEST, "Missing body", {});
  }

  const eventIdHeader = req.headers["x-razorpay-event-id"];
  const eventId = Array.isArray(eventIdHeader) ? eventIdHeader[0] : eventIdHeader;

  // Missing signature falls through to the service: it fails verification
  // there (and gets a webhook_logs row), or is accepted under the
  // RAZORPAY_WEBHOOK_SKIP_SIGNATURE testing bypass.
  const data = await handleRazorpayWebhookService(rawBody, signature ?? "", eventId);
  sendResponse(res, { status: HttpStatusCode.OK, data, message: "Webhook processed" });
});

export const getTransactions = catchAsync(async (req: AuthRequest, res: Response) => {
  const userId = resolveUserId(req.session);
  if (!userId) return sendError(res, HttpStatusCode.UNAUTHORIZED, "Unauthorized", {});

  const pageRaw = Array.isArray(req.query.page) ? req.query.page[0] : req.query.page;
  const limitRaw = Array.isArray(req.query.limit) ? req.query.limit[0] : req.query.limit;
  const page = Math.max(1, parseInt((pageRaw as string) ?? "1", 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt((limitRaw as string) ?? "10", 10) || 10));
  const data = await getTransactionsService(userId, page, limit);
  sendResponse(res, { status: HttpStatusCode.OK, data, message: "Transactions fetched" });
});

export const getTransactionDetail = catchAsync(async (req: AuthRequest, res: Response) => {
  const userId = resolveUserId(req.session);
  if (!userId) return sendError(res, HttpStatusCode.UNAUTHORIZED, "Unauthorized", {});

  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const transactionId = rawId.startsWith("TXN-") ? parseTransactionId(rawId) : parseInt(rawId, 10);
  if (isNaN(transactionId)) return sendError(res, HttpStatusCode.BAD_REQUEST, "Invalid transaction id", {});

  const data = await getTransactionDetailService(userId, transactionId);
  sendResponse(res, { status: HttpStatusCode.OK, data, message: "Transaction fetched" });
});

export const downloadInvoice = catchAsync(async (req: AuthRequest, res: Response) => {
  const userId = resolveUserId(req.session);
  if (!userId) return sendError(res, HttpStatusCode.UNAUTHORIZED, "Unauthorized", {});

  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const transactionId = rawId.startsWith("TXN-") ? parseTransactionId(rawId) : parseInt(rawId, 10);
  if (isNaN(transactionId)) return sendError(res, HttpStatusCode.BAD_REQUEST, "Invalid transaction id", {});

  const data = await downloadInvoiceService(userId, transactionId);
  sendResponse(res, { status: HttpStatusCode.OK, data, message: "Invoice ready" });
});
