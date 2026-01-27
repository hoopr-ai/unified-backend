import type { Request, Response } from "express";
import { createActivity, type UserActivityDetails } from "../persistence-service/exports";
import { extractSessionMetadata } from "./session.helper";
import { ActivityAction } from "../dto-service/modules.export";

interface ActivitySession {
  userId?: number;
  sessionId?: number;
}

/**
 * Determine the action type based on HTTP method and endpoint
 */
export const determineAction = (method: string, endpoint: string): string => {
  const methodLower = method.toLowerCase();
  const endpointLower = endpoint.toLowerCase();

  // Check for login/logout
  if (endpointLower.includes("login")) {
    return ActivityAction.LOGIN;
  }
  if (endpointLower.includes("logout")) {
    return ActivityAction.LOGOUT;
  }

  // Check for search
  if (endpointLower.includes("search") || endpointLower.includes("filter")) {
    return ActivityAction.SEARCH;
  }

  // Check for export/import
  if (endpointLower.includes("export")) {
    return ActivityAction.EXPORT;
  }
  if (endpointLower.includes("import")) {
    return ActivityAction.IMPORT;
  }

  // Determine by HTTP method
  switch (methodLower) {
    case "get":
      return ActivityAction.VIEW;
    case "post":
      return ActivityAction.CREATE;
    case "put":
    case "patch":
      return ActivityAction.UPDATE;
    case "delete":
      return ActivityAction.DELETE;
    default:
      return ActivityAction.API_CALL;
  }
};

/**
 * Sanitize request body to remove sensitive data
 */
export const sanitizeRequestBody = (body: Record<string, unknown>): Record<string, unknown> => {
  const sensitiveFields = ["password", "oldPassword", "newPassword", "token", "secret", "apiKey"];
  const sanitized = { ...body };

  for (const field of sensitiveFields) {
    if (field in sanitized) {
      sanitized[field] = "[REDACTED]";
    }
  }

  return sanitized;
};

/**
 * Log user activity to the database
 */
export const logActivity = async (
  req: Request,
  res: Response,
  session: ActivitySession,
  responseTime?: number
): Promise<void> => {
  try {
    if (!session.userId || !session.sessionId) {
      return;
    }

    const metadata = extractSessionMetadata(req);
    const action = determineAction(req.method, req.originalUrl);

    const activityData: UserActivityDetails = {
      userId: session.userId,
      sessionId: session.sessionId,
      action,
      endpoint: req.originalUrl,
      method: req.method,
      statusCode: res.statusCode,
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
      deviceType: metadata.deviceType,
      browser: metadata.browser,
      os: metadata.os,
      metadata: {
        query: req.query,
        params: req.params,
      },
      requestBody: Object.keys(req.body || {}).length > 0
        ? sanitizeRequestBody(req.body)
        : undefined,
      responseTime,
      createdAt: new Date(),
    };

    await createActivity(activityData);
  } catch (error) {
    // Log error but don't throw - activity logging should not break the request
    console.error("Failed to log activity:", error);
  }
};

/**
 * Create activity logger middleware that logs activities after response
 */
export const activityLoggerMiddleware = () => {
  return (req: Request, res: Response, next: () => void) => {
    const startTime = Date.now();

    // Store original end function
    const originalEnd = res.end;

    // Override end function to log activity after response
    (res.end as any) = function (...args: any[]) {
      const responseTime = Date.now() - startTime;

      // Get session info from request (set by authenticate middleware)
      const session = (req as Request & { session?: ActivitySession }).session as ActivitySession | undefined;
      if (session?.userId && session?.sessionId) {
        // Log activity asynchronously
        logActivity(req, res, session, responseTime).catch((err) => {
          console.error("Activity logging error:", err);
        });
      }

      // Call original end function
      return (originalEnd as any).apply(res, args);
    };

    next();
  };
};
