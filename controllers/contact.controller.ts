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
