import type { Request, Response } from "express";
import {
  userLoginService,
  userResetPasswordService,
  createUserService,
  inviteUserService,
  logoutUserService,
  logoutAllSessionsService,
  refreshTokenService,
  completeProfileService,
  getUserProfileService,
  updateUserProfileService,
  getUsersUnderAdminService,
  removeInvitedUserService,
  sendOtpService,
  verifyOtpService,
  sendEmailOtpService,
  verifyEmailOtpService,
} from "../services/business-service/modules.export";
import {
  catchAsync,
  extractSessionMetadata,
  sendResponse,
  sendError,
} from "../services/helper-service/modules.export";
import { ResponseMessages } from "../services/dto-service/constants/response-messages";
import { HttpStatusCode, RefreshTokenExpiryInSeconds } from "../services/dto-service/modules.export";
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
    maxAge: response.expiresIn * 1000,
  });

  // Set refreshToken in HTTP-only cookie
  res.cookie("refreshToken", response.refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: RefreshTokenExpiryInSeconds * 1000,
  });

  sendResponse(res, {
    status: HttpStatusCode.OK,
    data: response,
    message: ResponseMessages.LoginSuccess,
  });
});

export const logout = catchAsync(async (req: AuthRequest, res: Response) => {
  const sessionToken = req.sessionToken;
  if (sessionToken) {
    await logoutUserService(sessionToken);
  }
  res.clearCookie("sessionId");
  res.clearCookie("refreshToken");
  sendResponse(res, {
    status: HttpStatusCode.OK,
    data: {},
    message: ResponseMessages.LogoutSuccess,
  });
});

export const refreshToken = catchAsync(async (req: Request, res: Response) => {
  const token = req.cookies?.refreshToken || req.body?.refreshToken;
  if (!token) {
    throw new Error("Refresh token required");
  }
  const result = await refreshTokenService(token);

  res.cookie("refreshToken", result.refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: RefreshTokenExpiryInSeconds * 1000,
  });

  sendResponse(res, {
    status: HttpStatusCode.OK,
    data: { accessToken: result.accessToken, expiresIn: result.expiresIn },
    message: "Token refreshed successfully",
  });
});

export const logoutAllSessions = catchAsync(
  async (req: AuthRequest, res: Response) => {
    const userId = req.session?.userId;
    if (userId) {
      await logoutAllSessionsService(userId);
    }
    res.clearCookie("sessionId");
    res.clearCookie("refreshToken");
    sendResponse(res, {
      status: HttpStatusCode.OK,
      data: {},
      message: ResponseMessages.LogoutAllSuccess,
    });
  },
);

export const resetPassword = catchAsync(async (req: Request, res: Response) => {
  const response = await userResetPasswordService(req.body);
  sendResponse(res, {
    status: HttpStatusCode.OK,
    data: response,
    message: ResponseMessages.ResetPasswordSuccess,
  });
});

export const create = catchAsync(async (req: AuthRequest, res: Response) => {
  const createdBy = req.session?.userId;
  const response = await createUserService(req.body, createdBy);
  sendResponse(res, {
    status: HttpStatusCode.OK,
    data: response,
    message: ResponseMessages.USerCreatedSuccess,
  });
});

export const inviteUser = catchAsync(
  async (req: AuthRequest, res: Response) => {
    const response = await inviteUserService(req.body, req.session);
    sendResponse(res, {
      status: HttpStatusCode.OK,
      data: response,
      message: ResponseMessages.UserInvitedSuccess,
    });
  },
);

export const completeProfile = catchAsync(
  async (req: AuthRequest, res: Response) => {
    const userId = req.session?.userId;
    if (!userId) {
      return sendError(res, HttpStatusCode.UNAUTHORIZED, "Unauthorized", {});
    }
    const response = await completeProfileService(req.body, userId);
    sendResponse(res, {
      status: HttpStatusCode.OK,
      data: response,
      message: ResponseMessages.ProfileCompletedSuccess,
    });
  },
);

export const getUserActivities = catchAsync(
  async (req: AuthRequest, res: Response) => {
    const { findActivitiesByUserId } =
      await import("../services/persistence-service/exports");
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
  },
);

export const getUserSessions = catchAsync(
  async (req: AuthRequest, res: Response) => {
    const { getUserSessions: fetchUserSessions } =
      await import("../services/persistence-service/exports");
    const { SessionStatus } =
      await import("../services/dto-service/modules.export");
    const userId = req.session?.userId;
    const status = req.query.status as string | undefined;
    if (!userId) {
      return sendError(res, HttpStatusCode.UNAUTHORIZED, "Unauthorized", {});
    }
    const sessions = await fetchUserSessions(
      userId,
      status === "active" ? SessionStatus.ACTIVE : undefined,
    );
    sendResponse(res, {
      status: HttpStatusCode.OK,
      data: { sessions },
      message: ResponseMessages.GetUserSessionsSuccess,
    });
  },
);

export const getProfile = catchAsync(
  async (req: AuthRequest, res: Response) => {
    const userId = req.session?.userId;
    if (!userId) {
      return sendError(res, HttpStatusCode.UNAUTHORIZED, "Unauthorized", {});
    }
    const response = await getUserProfileService(userId);
    sendResponse(res, {
      status: HttpStatusCode.OK,
      data: response,
      message: ResponseMessages.GetProfileSuccess,
    });
  },
);

export const updateProfile = catchAsync(
  async (req: AuthRequest, res: Response) => {
    const userId = req.session?.userId;
    if (!userId) {
      return sendError(res, HttpStatusCode.UNAUTHORIZED, "Unauthorized", {});
    }
    const response = await updateUserProfileService(req.body, userId);
    sendResponse(res, {
      status: HttpStatusCode.OK,
      data: response,
      message: ResponseMessages.UpdateProfileSuccess,
    });
  },
);

export const getUsers = catchAsync(async (req: AuthRequest, res: Response) => {
  const userId = req.session?.userId;
  if (!userId) {
    return sendError(res, HttpStatusCode.UNAUTHORIZED, "Unauthorized", {});
  }
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 10;
  const response = await getUsersUnderAdminService(userId, page, limit);
  sendResponse(res, {
    status: HttpStatusCode.OK,
    data: response,
    message: ResponseMessages.GetUsersSuccess,
  });
});

// Admin edit of an arbitrary user's basic profile fields (client-credentials console)
export const updateUserById = catchAsync(
  async (req: AuthRequest, res: Response) => {
    const targetUserId = Number(req.params.userId);
    const response = await updateUserProfileService(req.body, targetUserId);
    sendResponse(res, {
      status: HttpStatusCode.OK,
      data: response,
      message: ResponseMessages.UserUpdatedSuccess,
    });
  },
);

export const removeInvitedUser = catchAsync(
  async (req: AuthRequest, res: Response) => {
    const adminUserId = req.session?.userId;
    if (!adminUserId) {
      return sendError(res, HttpStatusCode.UNAUTHORIZED, "Unauthorized", {});
    }
    const targetUserId = parseInt(req.params.userId as string);
    const response = await removeInvitedUserService(targetUserId, adminUserId);
    sendResponse(res, {
      status: HttpStatusCode.OK,
      data: response,
      message: ResponseMessages.UserRemovedSuccess,
    });
  },
);

export const sendOtp = catchAsync(async (req: Request, res: Response) => {
  const response = await sendOtpService(req.body);
  sendResponse(res, {
    status: HttpStatusCode.OK,
    data: response,
    message: ResponseMessages.OtpSentSuccess,
  });
});

export const verifyOtp = catchAsync(async (req: Request, res: Response) => {
  const response = await verifyOtpService(req.body);
  sendResponse(res, {
    status: HttpStatusCode.OK,
    data: response,
    message: ResponseMessages.OtpVerifiedSuccess,
  });
});

export const sendEmailOtp = catchAsync(async (req: Request, res: Response) => {
  const response = await sendEmailOtpService(req.body);
  sendResponse(res, {
    status: HttpStatusCode.OK,
    data: response,
    message: ResponseMessages.OtpSentSuccess,
  });
});

export const verifyEmailOtp = catchAsync(
  async (req: Request, res: Response) => {
    const response = await verifyEmailOtpService(req.body);

    res.cookie("sessionId", response.sessionId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: response.expiresIn * 1000,
    });

    res.cookie("refreshToken", response.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: RefreshTokenExpiryInSeconds * 1000,
    });

    sendResponse(res, {
      status: HttpStatusCode.OK,
      data: response,
      message: ResponseMessages.LoginSuccess,
    });
  },
);
