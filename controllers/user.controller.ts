import type { Request, Response } from "express";
import {
  userLoginService,
  userResetPasswordService,
  createUserService,
  inviteUserService,
  logoutUserService,
  logoutAllSessionsService,
  completeProfileService,
  getUserProfileService,
  updateUserProfileService,
  getUsersUnderAdminService,
  removeInvitedUserService,
} from "../services/business-service/modules.export";
import {
  catchAsync,
  extractSessionMetadata,
  sendResponse,
  sendError,
} from "../services/helper-service/modules.export";
import { ResponseMessages } from "../services/dto-service/constants/response-messages";
import { HttpStatusCode } from "../services/dto-service/modules.export";
import type { SessionPayload } from "../middlewares/authenticate";

interface AuthRequest extends Request {
  session?: SessionPayload;
  sessionToken?: string;
  sessionIdFromCookie?: number;
}

export const login = catchAsync(async (req: Request, res: Response) => {
  const metadata = extractSessionMetadata(req);
  const response = await userLoginService(req.body, metadata);

  // Set sessionId in HTTP-only cookie
  res.cookie("sessionId", response.sessionId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: response.expiresIn * 1000, // Convert seconds to milliseconds
  });

  sendResponse(res, { status: HttpStatusCode.OK, data: response, message: ResponseMessages.LoginSuccess });
});

export const logout = catchAsync(async (req: AuthRequest, res: Response) => {
  const sessionToken = req.sessionToken;
  if (sessionToken) {
    await logoutUserService(sessionToken);
  }
  // Clear the sessionId cookie
  res.clearCookie("sessionId");
  sendResponse(res, { status: HttpStatusCode.OK, data: {}, message: ResponseMessages.LogoutSuccess });
});

export const logoutAllSessions = catchAsync(async (req: AuthRequest, res: Response) => {
  const userId = req.session?.userId;
  if (userId) {
    await logoutAllSessionsService(userId);
  }
  // Clear the sessionId cookie
  res.clearCookie("sessionId");
  sendResponse(res, { status: HttpStatusCode.OK, data: {}, message: ResponseMessages.LogoutAllSuccess });
});

export const resetPassword = catchAsync(async (req: Request, res: Response) => {
  const response = await userResetPasswordService(req.body);
  sendResponse(res, { status: HttpStatusCode.OK, data: response, message: ResponseMessages.ResetPasswordSuccess });
});

export const create = catchAsync(async (req: AuthRequest, res: Response) => {
  const createdBy = req.session?.userId;
  const response = await createUserService(req.body, createdBy);
  sendResponse(res, { status: HttpStatusCode.OK, data: response, message: ResponseMessages.USerCreatedSuccess });
});

export const inviteUser = catchAsync(async (req: AuthRequest, res: Response) => {
  const response = await inviteUserService(req.body, req.session);
  sendResponse(res, { status: HttpStatusCode.OK, data: response, message: ResponseMessages.UserInvitedSuccess });
});

export const completeProfile = catchAsync(async (req: AuthRequest, res: Response) => {
  const userId = req.session?.userId;
  if (!userId) {
    return sendError(res, HttpStatusCode.UNAUTHORIZED, "Unauthorized", {});
  }
  const response = await completeProfileService(req.body, userId);
  sendResponse(res, { status: HttpStatusCode.OK, data: response, message: ResponseMessages.ProfileCompletedSuccess });
});

export const getUserActivities = catchAsync(async (req: AuthRequest, res: Response) => {
  const { findActivitiesByUserId } = await import("../services/persistence-service/exports");
  const userId = req.session?.userId;
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 50;

  if (!userId) {
    return sendError(res, HttpStatusCode.UNAUTHORIZED, "Unauthorized", {});
  }

  const { rows, count } = await findActivitiesByUserId(userId, page, limit);

  sendResponse(res, {
    status: HttpStatusCode.OK,
    data: {
      activities: rows,
      pagination: {
        page,
        limit,
        totalItems: count,
        totalPages: Math.ceil(count / limit),
      },
    },
    message: ResponseMessages.GetUserActivitiesSuccess,
  });
});

export const getUserSessions = catchAsync(async (req: AuthRequest, res: Response) => {
  const { getUserSessions: fetchUserSessions } = await import("../services/persistence-service/exports");
  const { SessionStatus } = await import("../services/dto-service/modules.export");
  const userId = req.session?.userId;
  const status = req.query.status as string | undefined;
  if (!userId) {
    return sendError(res, HttpStatusCode.UNAUTHORIZED, "Unauthorized", {});
  }
  const sessions = await fetchUserSessions(
    userId,
    status === "active" ? SessionStatus.ACTIVE : undefined
  );
  sendResponse(res, { status: HttpStatusCode.OK, data: { sessions }, message: ResponseMessages.GetUserSessionsSuccess });
});

export const getProfile = catchAsync(async (req: AuthRequest, res: Response) => {
  const userId = req.session?.userId;
  if (!userId) {
    return sendError(res, HttpStatusCode.UNAUTHORIZED, "Unauthorized", {});
  }
  const response = await getUserProfileService(userId);
  sendResponse(res, { status: HttpStatusCode.OK, data: response, message: ResponseMessages.GetProfileSuccess });
});

export const updateProfile = catchAsync(async (req: AuthRequest, res: Response) => {
  const userId = req.session?.userId;
  if (!userId) {
    return sendError(res, HttpStatusCode.UNAUTHORIZED, "Unauthorized", {});
  }
  const response = await updateUserProfileService(req.body, userId);
  sendResponse(res, { status: HttpStatusCode.OK, data: response, message: ResponseMessages.UpdateProfileSuccess });
});

export const getUsers = catchAsync(async (req: AuthRequest, res: Response) => {
  const userId = req.session?.userId;
  if (!userId) {
    return sendError(res, HttpStatusCode.UNAUTHORIZED, "Unauthorized", {});
  }
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 10;
  const response = await getUsersUnderAdminService(userId, page, limit);
  sendResponse(res, { status: HttpStatusCode.OK, data: response, message: ResponseMessages.GetUsersSuccess });
});

export const removeInvitedUser = catchAsync(async (req: AuthRequest, res: Response) => {
  const adminUserId = req.session?.userId;
  if (!adminUserId) {
    return sendError(res, HttpStatusCode.UNAUTHORIZED, "Unauthorized", {});
  }
  const targetUserId = parseInt(req.params.userId as string);
  const response = await removeInvitedUserService(targetUserId, adminUserId);
  sendResponse(res, { status: HttpStatusCode.OK, data: response, message: ResponseMessages.UserRemovedSuccess });
});
