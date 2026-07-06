import type { Request, Response } from "express";
import { recordJourneyEventService } from "../services/business-service/modules.export";
import {
  catchAsync,
  sendResponse,
  sendError,
  extractSessionMetadata,
} from "../services/helper-service/modules.export";
import { HttpStatusCode } from "../services/dto-service/modules.export";
import type { SessionPayload } from "../middlewares/authenticate";

interface AuthRequest extends Request {
  session?: SessionPayload;
}

export const trackJourneyEvent = catchAsync(async (req: AuthRequest, res: Response) => {
  const userId = req.session?.userId;
  const sessionId = req.session?.sessionId;
  if (!userId || !sessionId) {
    return sendError(res, HttpStatusCode.UNAUTHORIZED, "Unauthorized", {});
  }

  const metadata = extractSessionMetadata(req);
  await recordJourneyEventService(
    userId,
    sessionId,
    { eventName: req.body.eventName, metadata: req.body.metadata },
    metadata,
  );

  sendResponse(res, {
    status: HttpStatusCode.OK,
    data: { recorded: true },
    message: "Journey event recorded",
  });
});
