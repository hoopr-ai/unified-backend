import newrelic from 'newrelic';

/**
 * Custom attributes for user activity tracking in New Relic
 */
export interface UserActivityAttributes {
  userId?: number;
  sessionId?: number;
  action?: string;
  endpoint?: string;
  method?: string;
  statusCode?: number;
  responseTime?: number;
  deviceType?: string;
  browser?: string;
  os?: string;
  ipAddress?: string;
  platform?: string;
}

/**
 * Add custom attributes to the current transaction
 * These attributes will appear in New Relic APM transaction traces
 */
export const addTransactionAttributes = (attributes: UserActivityAttributes): void => {
  try {
    if (attributes.userId) {
      newrelic.addCustomAttribute('userId', attributes.userId);
    }
    if (attributes.sessionId) {
      newrelic.addCustomAttribute('sessionId', attributes.sessionId);
    }
    if (attributes.action) {
      newrelic.addCustomAttribute('action', attributes.action);
    }
    if (attributes.endpoint) {
      newrelic.addCustomAttribute('endpoint', attributes.endpoint);
    }
    if (attributes.deviceType) {
      newrelic.addCustomAttribute('deviceType', attributes.deviceType);
    }
    if (attributes.browser) {
      newrelic.addCustomAttribute('browser', attributes.browser);
    }
    if (attributes.os) {
      newrelic.addCustomAttribute('os', attributes.os);
    }
    if (attributes.platform) {
      newrelic.addCustomAttribute('platform', attributes.platform);
    }
  } catch (error) {
    // Silently fail - don't break the request if New Relic fails
  }
};

/**
 * Record a custom event for user activity
 * Use this for creating custom dashboards and NRQL queries
 */
export const recordUserActivity = (attributes: UserActivityAttributes): void => {
  try {
    newrelic.recordCustomEvent('UserActivity', {
      userId: attributes.userId ?? 0,
      sessionId: attributes.sessionId ?? 0,
      action: attributes.action ?? 0,
      endpoint: attributes.endpoint ?? 0,
      method: attributes.method ?? 0,
      statusCode: attributes.statusCode ?? 0,
      responseTime: attributes.responseTime ?? 0,
      deviceType: attributes.deviceType ?? 0,
      browser: attributes.browser ?? 0,
      os: attributes.os ?? 0,
      timestamp: Date.now(),
    });
  } catch (error) {
    // Silently fail
  }
};

/**
 * Record a custom event for tracking active users
 */
export const recordActiveUser = (userId: number, sessionId: number, platform?: string): void => {
  try {
    newrelic.recordCustomEvent('ActiveUser', {
      userId,
      sessionId,
      platform: platform || 'unknown',
      timestamp: Date.now(),
    });
  } catch (error) {
    // Silently fail
  }
};

/**
 * Record API endpoint performance metrics
 */
export const recordEndpointMetrics = (
  endpoint: string,
  method: string,
  responseTime: number,
  statusCode: number
): void => {
  try {
    newrelic.recordCustomEvent('EndpointMetrics', {
      endpoint,
      method,
      responseTime,
      statusCode,
      isError: statusCode >= 400,
      isServerError: statusCode >= 500,
      timestamp: Date.now(),
    });
  } catch (error) {
    // Silently fail
  }
};

/**
 * Record user journey/flow event
 * Useful for tracking user paths through the application
 */
export const recordUserJourney = (
  userId: number,
  sessionId: number,
  action: string,
  previousAction?: string,
  metadata?: Record<string, unknown>
): void => {
  try {
    newrelic.recordCustomEvent('UserJourney', {
      userId,
      sessionId,
      action,
      previousAction: previousAction || 'start',
      ...metadata,
      timestamp: Date.now(),
    });
  } catch (error) {
    // Silently fail
  }
};

/**
 * Record error with user context
 */
export const recordErrorWithContext = (
  error: Error,
  userId?: number,
  sessionId?: number,
  endpoint?: string
): void => {
  try {
    if (userId) {
      newrelic.addCustomAttribute('userId', userId.toString());
    }
    if (sessionId) {
      newrelic.addCustomAttribute('sessionId', sessionId.toString());
    }
    if (endpoint) {
      newrelic.addCustomAttribute('endpoint', endpoint);
    }
    newrelic.noticeError(error);
  } catch (e) {
    // Silently fail
  }
};

/**
 * Set transaction name for better grouping in New Relic
 */
export const setTransactionName = (name: string): void => {
  try {
    newrelic.setTransactionName(name);
  } catch (error) {
    // Silently fail
  }
};
