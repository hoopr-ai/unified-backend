import type { Request, Response } from "express";
import {
  createMixService,
  downloadMixService,
  listMixesService,
} from "../services/business-service/modules.export";
import {
  catchAsync,
  sendResponse,
} from "../services/helper-service/modules.export";
import { AppError } from "../services/helper-service/AppError";
import { ResponseMessages } from "../services/dto-service/constants/response-messages";
import { HttpStatusCode } from "../services/dto-service/modules.export";
import type { SessionPayload } from "../middlewares/authenticate";

interface AuthRequest extends Request {
  session?: SessionPayload;
}

/**
 * The multitrack mixer.
 *
 *   POST /mixer/mix        render one mix and license it
 *   GET  /mixer/downloads  this user's mix history
 *   POST /mixer/download   re-sign an expired link
 *
 * Every route is signed-in, and the owner always comes from the verified
 * session — never from the body. hoopr-backend's createMix was mounted with no
 * guard at all and took `consumerId` from the request, so the whole endpoint
 * was writable, and with a guessed id readable, by anyone.
 */

const requireUserId = (req: AuthRequest): number => {
  const userId = req.session?.userId;
  if (!userId) throw new AppError("Unauthorized", 401);
  return userId;
};

/**
 * 200 rather than 201: an identical recipe reuses the existing render and
 * creates nothing, so a fixed 201 would misreport half the responses.
 */
export const createMix = catchAsync(async (req: AuthRequest, res: Response) => {
  const data = await createMixService(requireUserId(req), req.body);

  sendResponse(res, {
    status: HttpStatusCode.OK,
    data,
    message: ResponseMessages.CreateMixSuccess,
  });
});

export const listMixes = catchAsync(async (req: AuthRequest, res: Response) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));

  const data = await listMixesService(requireUserId(req), page, limit);

  sendResponse(res, {
    status: HttpStatusCode.OK,
    data,
    message: ResponseMessages.GetMixesSuccess,
  });
});

export const downloadMix = catchAsync(async (req: AuthRequest, res: Response) => {
  const data = await downloadMixService(requireUserId(req), Number(req.body.mixId));

  sendResponse(res, {
    status: HttpStatusCode.OK,
    data,
    message: ResponseMessages.GetMixDownloadSuccess,
  });
});
