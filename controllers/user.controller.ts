import type { Request, Response } from "express";
import {
  userLoginService,
  userResetPasswordService,
  createUserService,
  inviteUserService,
  logoutUserService,
  logoutAllSessionsService,
} from "../services/business-service/modules.export";
import {
  catchAsync,
  extractSessionMetadata,
  sendSuccess,
  sendError,
} from "../services/helper-service/modules.export";
import { ResponseMessages } from "../services/dto-service/constants/response-messages";
import type { SessionPayload } from "../middlewares/authenticate";

interface AuthRequest extends Request {
  session?: SessionPayload;
  sessionToken?: string;
}

export const login = catchAsync(async (req: Request, res: Response) => {
  const metadata = extractSessionMetadata(req);
  const response = await userLoginService(req.body, metadata);
  sendSuccess(res, response, ResponseMessages.LoginSuccess);
});

export const logout = catchAsync(async (req: AuthRequest, res: Response) => {
  const sessionToken = req.sessionToken;
  if (sessionToken) {
    await logoutUserService(sessionToken);
  }
  sendSuccess(res, {}, ResponseMessages.LogoutSuccess);
});

export const logoutAllSessions = catchAsync(async (req: AuthRequest, res: Response) => {
  const userId = req.session?.userId;
  if (userId) {
    await logoutAllSessionsService(userId);
  }
  sendSuccess(res, {}, ResponseMessages.LogoutAllSuccess);
});

export const resetPassword = catchAsync(async (req: Request, res: Response) => {
  const response = await userResetPasswordService(req.body);
  sendSuccess(res, response, ResponseMessages.ResetPasswordSuccess);
});

export const create = catchAsync(async (req: AuthRequest, res: Response) => {
  const createdBy = req.session?.userId;
  const response = await createUserService(req.body, createdBy);
  sendSuccess(res, response, ResponseMessages.USerCreatedSuccess);
});

export const inviteUser = catchAsync(async (req: AuthRequest, res: Response) => {
  const createdBy = req.session?.userId;
  const response = await inviteUserService(req.body, createdBy);
  sendSuccess(res, response, ResponseMessages.UserInvitedSuccess);
});

export const getUserActivities = catchAsync(async (req: AuthRequest, res: Response) => {
  const { findActivitiesByUserId } = await import("../services/persistence-service/exports");
  const userId = req.session?.userId;
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 50;

  if (!userId) {
    return sendError(res, 401, "Unauthorized", {});
  }

  const { rows, count } = await findActivitiesByUserId(userId, page, limit);

  sendSuccess(res, {
    activities: rows,
    pagination: {
      page,
      limit,
      totalItems: count,
      totalPages: Math.ceil(count / limit),
    },
  }, ResponseMessages.GetUserActivitiesSuccess);
});

export const getUserSessions = catchAsync(async (req: AuthRequest, res: Response) => {
  const { getUserSessions: fetchUserSessions } = await import("../services/persistence-service/exports");
  const { SessionStatus } = await import("../services/dto-service/modules.export");
  const userId = req.session?.userId;
  const status = req.query.status as string | undefined;

  if (!userId) {
    return sendError(res, 401, "Unauthorized", {});
  }

  const sessions = await fetchUserSessions(
    userId,
    status === "active" ? SessionStatus.ACTIVE : undefined
  );

  sendSuccess(res, { sessions }, ResponseMessages.GetUserSessionsSuccess);
});
