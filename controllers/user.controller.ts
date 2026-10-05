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
  getCompleteProfileContextService,
  getUserProfileService,
  markTourSeenService,
  updateUserProfileService,
  getUsersUnderAdminService,
  removeInvitedUserService,
  sendOtpService,
  verifyOtpService,
  sendEmailOtpService,
  verifyEmailOtpService,
} from "../services/business-service/modules.export";
import {
  AppError,
  catchAsync,
  extractSessionMetadata,
  sendResponse,
  sendError,
} from "../services/helper-service/modules.export";
import { ResponseMessages } from "../services/dto-service/constants/response-messages";
import { HttpStatusCode, RefreshTokenExpiryInSeconds } from "../services/dto-service/modules.export";
import type { SessionPayload } from "../middlewares/authenticate";
import {
  getTrialWithNudgesService,
  notifySalesDomainConflict,
  recordTrialSignalService,
} from "../services/business-service/trial/trial-journey.service";
import { redeemMagicLinkService } from "../services/business-service/trial/magic-link.service";
import { SignupRejectReason } from "../services/dto-service/trial/trial.dto";
import { findUserById } from "../services/persistence-service/exports";

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
    // refreshToken is echoed back so localStorage-based clients can keep their
    // copy in sync. It is currently unchanged by refresh (see refreshTokenService).
    data: {
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      expiresIn: result.expiresIn,
    },
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

export const getCompleteProfileContext = catchAsync(
  async (req: AuthRequest, res: Response) => {
    const userId = req.session?.userId;
    if (!userId) {
      return sendError(res, HttpStatusCode.UNAUTHORIZED, "Unauthorized", {});
    }
    const response = await getCompleteProfileContextService(userId);
    sendResponse(res, {
      status: HttpStatusCode.OK,
      data: response,
      message: ResponseMessages.GetProfileSuccess,
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

// POST /user/tour-seen — mark a coachmark tour seen for the caller.
export const tourSeen = catchAsync(
  async (req: AuthRequest, res: Response) => {
    const userId = req.session?.userId;
    if (!userId) {
      return sendError(res, HttpStatusCode.UNAUTHORIZED, "Unauthorized", {});
    }
    const response = await markTourSeenService(userId, req.body.tour);
    sendResponse(res, {
      status: HttpStatusCode.OK,
      data: response,
      message: ResponseMessages.TourSeenSuccess,
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
  const response = await sendEmailOtpService(req.body).catch((err) => {
    // A company that already has an account is a sales lead, not a dead end.
    if (err instanceof AppError && err.errorCode === SignupRejectReason.DOMAIN_EXISTS) {
      void notifySalesDomainConflict(String(req.body?.email ?? ""));
    }
    throw err;
  });
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

// GET /user/trial — the Smash trial meter + upgrade-wall flag for the caller's
// brand, plus the in-app nudges and the push inbox. `trial` is null when the
// brand was never on the trial. GET /user/profile carries the same `trial`;
// this is the poll for the Credits UI and the in-app journey surfaces.
export const getTrial = catchAsync(
  async (req: AuthRequest, res: Response) => {
    const userId = req.session?.userId;
    if (!userId) {
      return sendError(res, HttpStatusCode.UNAUTHORIZED, "Unauthorized", {});
    }
    const user = await findUserById(userId);
    sendResponse(res, {
      status: HttpStatusCode.OK,
      data: await getTrialWithNudgesService(userId, user?.brandId, user?.email),
      message: ResponseMessages.GetTrialSuccess,
    });
  },
);

// POST /user/trial/signal — FE-only moments the journey routes on (gated
// Enterprise track, tutorial skip, push permission, notification open/click,
// upgrade CTA). Mixpanel still gets these from the FE; this is the backend copy.
export const recordTrialSignal = catchAsync(
  async (req: AuthRequest, res: Response) => {
    const userId = req.session?.userId;
    if (!userId) {
      return sendError(res, HttpStatusCode.UNAUTHORIZED, "Unauthorized", {});
    }
    await recordTrialSignalService(userId, req.body);
    sendResponse(res, {
      status: HttpStatusCode.OK,
      data: { recorded: true },
      message: ResponseMessages.TrialSignalRecorded,
    });
  },
);

// POST /user/magic-link/verify — one-click login from a trial journey email.
// Sets the same cookies and returns the same body as verify-email-otp.
export const verifyMagicLink = catchAsync(
  async (req: Request, res: Response) => {
    const response = await redeemMagicLinkService(req.body.token);

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
