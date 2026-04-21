import type { Request, Response } from "express";
import { sendContactUsEmail } from "../services/helper-service/modules.export";
import {
  catchAsync,
  sendResponse,
  sendError,
} from "../services/helper-service/modules.export";
import { HttpStatusCode } from "../services/dto-service/modules.export";

export const contactUs = catchAsync(async (req: Request, res: Response) => {
  const { fullName, mobile, email, brandName, message } = req.body;

  if (!fullName || !email) {
    return sendError(res, HttpStatusCode.BAD_REQUEST, "Full name and email are required", {});
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return sendError(res, HttpStatusCode.BAD_REQUEST, "Please provide a valid email address", {});
  }

  if (mobile !== undefined && mobile !== null && mobile !== "") {
    const mobileStr = String(mobile).replace(/\s+/g, "");
    if (!/^\d{10}$/.test(mobileStr)) {
      return sendError(res, HttpStatusCode.BAD_REQUEST, "Mobile number must be exactly 10 digits", {});
    }
  }

  if (fullName.trim().length < 2) {
    return sendError(res, HttpStatusCode.BAD_REQUEST, "Full name must be at least 2 characters", {});
  }

  if (message && message.trim().length > 1000) {
    return sendError(res, HttpStatusCode.BAD_REQUEST, "Message must not exceed 1000 characters", {});
  }

  await sendContactUsEmail({
    userName: fullName,
    userEmail: email,
    mobile,
    brandName,
    message,
  });

  sendResponse(res, {
    status: HttpStatusCode.OK,
    data: {},
    message: "Your inquiry has been submitted successfully. Our team will contact you soon.",
  });
});
