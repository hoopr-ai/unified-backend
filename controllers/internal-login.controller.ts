import type { Request, Response } from "express";
import {
  catchAsync,
  sendResponse,
  extractSessionMetadata,
} from "../services/helper-service/modules.export";
import {
  HttpStatusCode,
  RefreshTokenExpiryInSeconds,
} from "../services/dto-service/modules.export";
import {
  sendInternalLoginOtpService,
  verifyInternalLoginOtpService,
} from "../services/business-service/admin-internal-users/internal-login-otp.service";

// POST /user/internal-login/send-otp
export const sendInternalLoginOtp = catchAsync(
  async (req: Request, res: Response) => {
    const result = await sendInternalLoginOtpService(req.body);
    sendResponse(res, {
      status: HttpStatusCode.OK,
      data: result,
      message: "OTP sent.",
    });
  }
);

// POST /user/internal-login/verify-otp
// On success, returns the same shape as POST /user/login + sets the same cookies, so the
// existing FE auth context (token / sessionId / refreshToken handling) doesn't need to change.
export const verifyInternalLoginOtp = catchAsync(
  async (req: Request, res: Response) => {
    const metadata = extractSessionMetadata(req);
    const result = await verifyInternalLoginOtpService(req.body, metadata);

    res.cookie("sessionId", result.sessionId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: result.expiresIn * 1000,
    });

    res.cookie("refreshToken", result.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: RefreshTokenExpiryInSeconds * 1000,
    });

    sendResponse(res, {
      status: HttpStatusCode.OK,
      data: result,
      message: "Login successful.",
    });
  }
);
