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
  parseTransactionId,
} from "../services/business-service/transaction/transaction.service";
import type { SessionPayload } from "../middlewares/authenticate";

interface AuthRequest extends Request {
  session?: SessionPayload;
}

export const initTransaction = catchAsync(async (req: AuthRequest, res: Response) => {
  const userId = req.session?.userId;
  const email = req.session?.email;
  if (!userId || !email) return sendError(res, HttpStatusCode.UNAUTHORIZED, "Unauthorized", {});

  const data = await initTransactionService(userId, email);
  sendResponse(res, { status: HttpStatusCode.OK, data, message: "Payment initiated" });
});

export const commitTransaction = catchAsync(async (req: AuthRequest, res: Response) => {
  const userId = req.session?.userId;
  if (!userId) return sendError(res, HttpStatusCode.UNAUTHORIZED, "Unauthorized", {});

  const data = await commitTransactionService(userId, req.body);
  sendResponse(res, { status: HttpStatusCode.OK, data, message: "Payment successful" });
});

export const getTransactions = catchAsync(async (req: AuthRequest, res: Response) => {
  const userId = req.session?.userId;
  if (!userId) return sendError(res, HttpStatusCode.UNAUTHORIZED, "Unauthorized", {});

  const pageRaw = Array.isArray(req.query.page) ? req.query.page[0] : req.query.page;
  const limitRaw = Array.isArray(req.query.limit) ? req.query.limit[0] : req.query.limit;
  const page = Math.max(1, parseInt((pageRaw as string) ?? "1", 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt((limitRaw as string) ?? "10", 10) || 10));
  const data = await getTransactionsService(userId, page, limit);
  sendResponse(res, { status: HttpStatusCode.OK, data, message: "Transactions fetched" });
});

export const getTransactionDetail = catchAsync(async (req: AuthRequest, res: Response) => {
  const userId = req.session?.userId;
  if (!userId) return sendError(res, HttpStatusCode.UNAUTHORIZED, "Unauthorized", {});

  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const transactionId = rawId.startsWith("TXN-") ? parseTransactionId(rawId) : parseInt(rawId, 10);
  if (isNaN(transactionId)) return sendError(res, HttpStatusCode.BAD_REQUEST, "Invalid transaction id", {});

  const data = await getTransactionDetailService(userId, transactionId);
  sendResponse(res, { status: HttpStatusCode.OK, data, message: "Transaction fetched" });
});
