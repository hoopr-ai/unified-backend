import type { Request, Response } from "express";
import { getTokenDetailsService } from "../services/business-service/modules.export";
import {
  catchAsync,
  sendResponse,
  sendError,
} from "../services/helper-service/modules.export";
import { HttpStatusCode } from "../services/dto-service/modules.export";
import type { SessionPayload } from "../middlewares/authenticate";

interface AuthRequest extends Request {
  session?: SessionPayload;
}

export const getTokenDetails = catchAsync(async (req: AuthRequest, res: Response) => {
  const userId = req.session?.userId;
  if (!userId) {
    return sendError(res, HttpStatusCode.UNAUTHORIZED, "Unauthorized", {});
  }

  const response = await getTokenDetailsService(userId);
  sendResponse(res, {
    status: HttpStatusCode.OK,
    data: response,
    message: "Token details retrieved successfully",
  });
});
