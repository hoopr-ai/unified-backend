import { createActivity, type UserActivityDetails } from "../../persistence-service/exports";
import { logger } from "../../helper-service/logger";

interface InternalAuditParams {
  actorId: number;
  actorSessionId: number;
  action:
    | "create_internal_user"
    | "deactivate_internal_user"
    | "reactivate_internal_user"
    | "update_internal_user_functionalities"
    | "create_access_request"
    | "approve_access_request"
    | "reject_access_request";
  targetUserId: number;
  role?: string;
  endpoint: string;
  method: string;
  ipAddress?: string;
}

// Writes an explicit audit row with one of the precise INTERNAL-admin action codes
// (create_internal_user / deactivate_internal_user / reactivate_internal_user). The generic
// activityLoggerMiddleware also writes a user_activities row for every authenticated
// request — that's fine, this is the auditable record with the precise action code.
//
// Fire-and-forget. An audit-write failure must never fail the underlying admin operation.
export const recordInternalUserAudit = (p: InternalAuditParams): void => {
  const data: UserActivityDetails = {
    userId: p.actorId,
    sessionId: p.actorSessionId,
    action: p.action,
    endpoint: p.endpoint,
    method: p.method,
    statusCode: 200,
    ipAddress: p.ipAddress,
    metadata: {
      targetUserId: p.targetUserId,
      ...(p.role ? { role: p.role } : {}),
    },
    createdAt: new Date(),
  };
  createActivity(data).catch((err) => {
    logger.error("internal_user_audit_failed", {
      action: p.action,
      actorId: p.actorId,
      targetUserId: p.targetUserId,
      error: String(err),
    });
  });
};
