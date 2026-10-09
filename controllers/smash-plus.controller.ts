import type { Request, Response } from "express";
import {
  sendResponse,
  sendError,
  getClientIp,
  logger,
} from "../services/helper-service/modules.export";
import { HttpStatusCode } from "../services/dto-service/modules.export";
import { smashPlusBriefSchema } from "../middlewares/smash-plus.validation";
import {
  isSmashPlusBriefRateLimited,
  submitSmashPlusBriefService,
  type SmashPlusBriefInput,
} from "../services/business-service/smash-plus/smash-plus-brief.service";
import type { SessionPayload } from "../middlewares/authenticate";

interface AuthRequest extends Request {
  session?: SessionPayload;
}

const SAVE_FAILED = "Could not save your brief. Please try again in a moment.";

/**
 * POST /smash-plus/brief — PUBLIC (the landing page opens signed out).
 *
 * Response contract is fixed by the FE: success is
 *   { data: { briefId }, error: { code: 0, message: "" } }
 * and any failure is { data: null, error: { code: 1, message } } with a
 * message the page toasts verbatim. Hence no catchAsync here — an unexpected
 * error must still come back in that shape, not the global handler's.
 */
export const submitSmashPlusBrief = async (req: AuthRequest, res: Response) => {
  try {
    const { error, value } = smashPlusBriefSchema.validate(req.body ?? {});
    if (error) {
      return sendError(res, HttpStatusCode.BAD_REQUEST, error.details[0].message);
    }
    const input = value as SmashPlusBriefInput;

    const ipAddress = getClientIp(req);
    if (await isSmashPlusBriefRateLimited(ipAddress, input.email)) {
      return sendError(
        res,
        HttpStatusCode.TOO_MANY_REQUESTS,
        "You've sent several briefs in a short time. Please wait a little and try again."
      );
    }

    const { briefId } = await submitSmashPlusBriefService(input, {
      userId: req.session?.userId,
      platform: req.session?.platform,
      ipAddress,
      userAgent: req.get("user-agent"),
    });

    return sendResponse(res, {
      status: HttpStatusCode.OK,
      data: { briefId },
      message: "",
    });
  } catch (err) {
    logger.error(`smash-plus brief submit failed: ${(err as Error).message}`);
    return sendError(res, HttpStatusCode.INTERNAL_SERVER_ERROR, SAVE_FAILED);
  }
};
