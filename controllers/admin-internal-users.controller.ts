import type { Request, Response } from "express";
import {
  catchAsync,
  sendResponse,
  AppError,
  getClientIp,
} from "../services/helper-service/modules.export";
import { HttpStatusCode } from "../services/dto-service/constants/modules.export";
import {
  createInternalUserService,
  listInternalUsersService,
  resetInternalUserPasswordService,
  type AllowedFeRole,
} from "../services/business-service/admin-internal-users/modules.export";
import { listInternalUsersQuerySchema } from "../middlewares/admin-internal-users.validation";
import type { SessionPayload } from "../middlewares/authenticate";

interface AuthRequest extends Request {
  session?: SessionPayload;
}

const requireActor = (req: AuthRequest): {
  actorId: number;
  actorSessionId: number;
} => {
  const actorId = req.session?.userId;
  const actorSessionId = req.session?.sessionId;
  if (!actorId || !actorSessionId) {
    // authenticateWithSession should have set both. If not, treat as unauthenticated.
    throw new AppError("Unauthorized", 401);
  }
  return { actorId, actorSessionId };
};

// POST /admin/internal-users
export const createInternalUser = catchAsync(
  async (req: AuthRequest, res: Response) => {
    const { actorId, actorSessionId } = requireActor(req);
    const result = await createInternalUserService(req.body, {
      actorId,
      actorSessionId,
      ip: getClientIp(req),
      endpoint: req.originalUrl,
      method: req.method,
    });

    sendResponse(res, {
      status: HttpStatusCode.CREATED,
      data: result,
      message: "Internal user created.",
    });
  }
);

// GET /admin/internal-users
export const listInternalUsers = catchAsync(
  async (req: AuthRequest, res: Response) => {
    const { value, error } = listInternalUsersQuerySchema.validate(req.query, {
      abortEarly: false,
      stripUnknown: true,
      convert: true,
    });
    if (error) {
      throw new AppError(
        error.details.map((d) => d.message).join(", "),
        400
      );
    }

    const result = await listInternalUsersService({
      page: value.page,
      limit: value.limit,
      search: value.search,
      role: value.role as AllowedFeRole | undefined,
    });

    sendResponse(res, {
      status: HttpStatusCode.OK,
      data: result,
      message: "Internal users fetched.",
    });
  }
);

// POST /admin/internal-users/:id/reset-password
export const resetInternalUserPassword = catchAsync(
  async (req: AuthRequest, res: Response) => {
    const { actorId, actorSessionId } = requireActor(req);
    const idParam = req.params.id;
    const targetUserId = parseInt(
      typeof idParam === "string" ? idParam : "",
      10
    );
    if (!Number.isFinite(targetUserId) || targetUserId <= 0) {
      throw new AppError("Invalid user id.", 400);
    }

    const result = await resetInternalUserPasswordService(targetUserId, {
      actorId,
      actorSessionId,
      ip: getClientIp(req),
      endpoint: req.originalUrl,
      method: req.method,
    });

    if (result.rateLimited) {
      res.setHeader("Retry-After", String(result.retryAfterSeconds ?? 60));
      sendResponse(res, {
        status: HttpStatusCode.TOO_MANY_REQUESTS,
        code: 1,
        data: { retryAfterSeconds: result.retryAfterSeconds },
        message: "Password reset rate limit exceeded for this user.",
      });
      return;
    }

    sendResponse(res, {
      status: HttpStatusCode.OK,
      data: {
        id: result.id,
        tempPassword: result.tempPassword,
        emailSent: result.emailSent,
      },
      message: "Password reset.",
    });
  }
);
