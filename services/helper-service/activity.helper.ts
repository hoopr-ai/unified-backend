import type { Request, Response } from "express";
import { createActivity, findActiveSessionById, type UserActivityDetails } from "../persistence-service/exports";
import { extractSessionMetadata } from "./session.helper";
import { ActivityAction } from "../dto-service/modules.export";
import { logger } from "./logger";
import {
  addTransactionAttributes,
  recordUserActivity,
  recordEndpointMetrics,
  recordUserJourney,
  recordActiveUser,
} from "./newrelic.helper";

// Simple in-memory cache for session lookups to avoid repeated DB calls
const sessionCache = new Map<number, { userId: number; expiresAt: number }>();
const SESSION_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Endpoints to skip logging (health checks, static assets, etc.)
const SKIP_LOGGING_PATTERNS = [
  /^\/health-check/,
  /^\/favicon/,
  // Journey events write their own user_activities row with the event name as
  // action — middleware logging here would duplicate every event as CREATE.
  /^\/journey\//,
  /\.(css|js|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$/,
];

// High-value actions to always log to DB (for audit trail)
const HIGH_VALUE_ACTIONS = [
  ActivityAction.LOGIN,
  ActivityAction.LOGOUT,
  ActivityAction.CREATE,
  ActivityAction.UPDATE,
  ActivityAction.DELETE,
  ActivityAction.EXPORT,
  ActivityAction.IMPORT,
];

/**
 * Check if endpoint should be skipped from logging
 */
const shouldSkipLogging = (endpoint: string): boolean => {
  return SKIP_LOGGING_PATTERNS.some(pattern => pattern.test(endpoint));
};

/**
 * Get userId from sessionId using cache-first strategy
 */
const getUserIdFromSessionId = async (sessionId: number): Promise<number | null> => {
  // Check cache first
  const cached = sessionCache.get(sessionId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.userId;
  }

  // Fetch from DB
  const session = await findActiveSessionById(sessionId);
  if (session?.userId) {
    // Cache the result
    sessionCache.set(sessionId, {
      userId: session.userId,
      expiresAt: Date.now() + SESSION_CACHE_TTL,
    });
    return session.userId;
  }

  return null;
};

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

// Store last action per session for user journey tracking
const lastActionBySession = new Map<number, { action: string; timestamp: number }>();
const LAST_ACTION_TTL = 30 * 60 * 1000; // 30 minutes

/**
 * Log user activity - sends to New Relic and optionally to DB
 * Strategy: All activities go to New Relic, only high-value actions go to DB
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
    const endpoint = req.originalUrl.split('?')[0]; // Remove query params for cleaner logs

    // Prepare activity data
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

    // Add custom attributes to current transaction (for APM traces)
    addTransactionAttributes({
      userId: session.userId,
      sessionId: session.sessionId,
      action,
      endpoint,
      deviceType: metadata.deviceType,
      browser: metadata.browser,
      os: metadata.os,
    });

    // Record custom event for dashboards (UserActivity)
    recordUserActivity({
      userId: session.userId,
      sessionId: session.sessionId,
      action,
      endpoint,
      method: req.method,
      statusCode: res.statusCode,
      responseTime,
      deviceType: metadata.deviceType,
      browser: metadata.browser,
      os: metadata.os,
    });

    // Record endpoint performance metrics
    recordEndpointMetrics(endpoint, req.method, responseTime || 0, res.statusCode);

    // Track user journey (action flow)
    const lastAction = lastActionBySession.get(session.sessionId);
    const previousAction = lastAction && (Date.now() - lastAction.timestamp < LAST_ACTION_TTL)
      ? lastAction.action
      : undefined;

    recordUserJourney(session.userId, session.sessionId, action, previousAction, {
      endpoint,
      statusCode: res.statusCode,
    });

    // Update last action for this session
    lastActionBySession.set(session.sessionId, { action, timestamp: Date.now() });

    // Record active user (for unique user counts)
    if (action === ActivityAction.LOGIN || !lastAction) {
      recordActiveUser(session.userId, session.sessionId);
    }

    // Also log to Winston (for log forwarding)
    logger.info("user_activity", {
      userId: session.userId,
      sessionId: session.sessionId,
      action,
      endpoint,
      method: req.method,
      statusCode: res.statusCode,
      responseTime,
      deviceType: metadata.deviceType,
      browser: metadata.browser,
      os: metadata.os,
      ipAddress: metadata.ipAddress,
    });

    // Only save high-value actions to DB (reduces DB load, keeps audit trail)
    if (HIGH_VALUE_ACTIONS.includes(action as ActivityAction)) {
      await createActivity(activityData);
    }
  } catch (error) {
    // Log error but don't throw - activity logging should not break the request
    logger.error("activity_logging_error", { error: String(error) });
  }
};

/**
 * Create activity logger middleware that logs activities after response
 * Supports both token-based and session-cookie-based authentication
 */
export const activityLoggerMiddleware = () => {
  return (req: Request, res: Response, next: () => void) => {
    const startTime = Date.now();

    // Skip logging for certain endpoints
    if (shouldSkipLogging(req.originalUrl)) {
      return next();
    }

    // Store original end function
    const originalEnd = res.end;

    // Override end function to log activity after response
    (res.end as any) = async function (...args: any[]) {
      const responseTime = Date.now() - startTime;

      // Try to get session info from multiple sources
      let session: ActivitySession | undefined;

      // 1. First try: Get from request (set by authenticate middleware for token-based APIs)
      const reqWithSession = req as Request & { session?: ActivitySession };
      if (reqWithSession.session?.userId && reqWithSession.session?.sessionId) {
        session = reqWithSession.session;
      }

      // 2. Second try: Get from sessionId cookie (for non-token APIs)
      if (!session) {
        const sessionIdFromCookie = req.cookies?.sessionId
          ? parseInt(req.cookies.sessionId, 10)
          : undefined;

        if (sessionIdFromCookie && !isNaN(sessionIdFromCookie)) {
          const userId = await getUserIdFromSessionId(sessionIdFromCookie);
          if (userId) {
            session = {
              userId,
              sessionId: sessionIdFromCookie,
            };
          }
        }
      }

      // Log activity if we have valid session
      if (session?.userId && session?.sessionId) {
        logActivity(req, res, session, responseTime).catch((err) => {
          logger.error("activity_logging_error", { error: String(err) });
        });
      } else {
        // Log anonymous activity to New Relic only (for analytics)
        const metadata = extractSessionMetadata(req);
        const action = determineAction(req.method, req.originalUrl);
        logger.info("anonymous_activity", {
          action,
          endpoint: req.originalUrl.split('?')[0],
          method: req.method,
          statusCode: res.statusCode,
          responseTime,
          deviceType: metadata.deviceType,
          ipAddress: metadata.ipAddress,
        });
      }

      // Call original end function
      return (originalEnd as any).apply(res, args);
    };

    next();
  };
};
