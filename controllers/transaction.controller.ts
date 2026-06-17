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
