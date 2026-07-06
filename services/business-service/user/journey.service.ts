import { createActivity } from "../../persistence-service/user/modules.export";
import type { TrackJourneyEventRequest } from "../../dto-service/modules.export";

interface JourneyRequestContext {
  ipAddress?: string;
  userAgent?: string;
  deviceType?: string;
  browser?: string;
  os?: string;
}

// FE-reported UI step → stored in user_activities with the event name as action.
// API-driven steps (cart add, address save, payment init/commit) are logged by
// the activity middleware automatically; the funnel below combines both.
export const recordJourneyEventService = async (
  userId: number,
  sessionId: number,
  data: TrackJourneyEventRequest,
  context: JourneyRequestContext,
): Promise<void> => {
  await createActivity({
    userId,
    sessionId,
    action: data.eventName,
    endpoint: "/journey/event",
    method: "POST",
    statusCode: 200,
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
    deviceType: context.deviceType,
    browser: context.browser,
    os: context.os,
    metadata: data.metadata,
    createdAt: new Date(),
  });
};
