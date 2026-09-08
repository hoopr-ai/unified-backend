import type { Request, Response } from "express";
import { sendContactUsEmail } from "../services/helper-service/modules.export";
import {
  catchAsync,
  sendResponse,
  sendError,
  logger,
} from "../services/helper-service/modules.export";
import { HttpStatusCode, Platform } from "../services/dto-service/modules.export";
import { saveContactUs } from "../services/persistence-service/contact/modules.export";
import type { SessionPayload } from "../middlewares/authenticate";

interface AuthRequest extends Request {
  session?: SessionPayload;
}

export const contactUs = catchAsync(async (req: AuthRequest, res: Response) => {
  const { fullName, countryCode, mobile, email, brandName, message } = req.body;

  if (!fullName || !email) {
    return sendError(res, HttpStatusCode.BAD_REQUEST, "Full name and email are required", {});
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return sendError(res, HttpStatusCode.BAD_REQUEST, "Please provide a valid email address", {});
  }

  let mobileNumber: string | undefined;
  if (mobile !== undefined && mobile !== null && mobile !== "") {
    const mobileStr = String(mobile).replace(/\s+/g, "");
    const countryCodeStr = countryCode ? String(countryCode).replace(/\s+/g, "") : "";

    if (!/^\d+$/.test(mobileStr)) {
      return sendError(res, HttpStatusCode.BAD_REQUEST, "Mobile number must contain only digits", {});
    }

    // For India (+91 or 91), mobile number must be exactly 10 digits
    if (countryCodeStr === "+91" || countryCodeStr === "91") {
      if (mobileStr.length !== 10) {
        return sendError(res, HttpStatusCode.BAD_REQUEST, "Indian mobile number must be exactly 10 digits", {});
      }
    }

    // Combine country code and mobile number
    mobileNumber = countryCodeStr ? `${countryCodeStr}${mobileStr}` : mobileStr;
  }

  if (fullName.trim().length < 2) {
    return sendError(res, HttpStatusCode.BAD_REQUEST, "Full name must be at least 2 characters", {});
  }

  if (message && message.trim().length > 1000) {
    return sendError(res, HttpStatusCode.BAD_REQUEST, "Message must not exceed 1000 characters", {});
  }

  // PERSISTED FIRST, and this is the only step allowed to fail the request.
  // The row is the enquiry; the emails are a notification about it. This
  // endpoint used to do nothing but send mail, so every submission before this
  // was answered with a 200 and then dropped on the floor.
  const contact = await saveContactUs({
    // The tenancy key on the shared `contact_us` table, which also holds
    // STUDIO and CREATOR rows.
    //
    // The session claim is a signed JWT, already alias-normalized by the
    // middleware, so it stays correct even if this backend ever serves a
    // second product. It is absent for signed-out submitters — the common case
    // on a contact form — and ENTERPRISE is the right fallback because that is
    // what this deployment is: enterprise-fe hardcodes 'ENTERPRISE' for its own
    // login (pages/enterprise/Login.tsx), so this agrees with how the client
    // identifies itself everywhere else.
    //
    // NOT taken from the request body: an anonymous caller could then claim to
    // be STUDIO and file into another product's queue. NOT derived from the
    // email either — `users` is unique on (email, platform), so one address
    // legitimately exists on several platforms at once, and most submitters
    // have no account for it to be looked up against.
    platform: (req.session?.platform as Platform) ?? Platform.ENTERPRISE,
    name: fullName.trim(),
    email: email.trim().toLowerCase(),
    // The combined "+91XXXXXXXXXX" form, not the bare national number — the
    // country code is useless to whoever calls this person back if it is
    // dropped on the way to the table.
    mobile: mobileNumber ?? null,
    brandName: brandName?.trim() || null,
    message: message?.trim() || null,
  });

  // Deliberately not awaited. The enquiry is already durable, so a dead SMTP
  // host must not tell the visitor their submission failed and invite them to
  // send it again — the notification is recoverable from the table, the
  // submission is not.
  void sendContactUsEmail({
    userName: fullName,
    userEmail: email,
    mobile: mobileNumber,
    brandName,
    message,
  }).catch((err: unknown) => {
    logger.error(
      `contact-us ${contact.id} notification failed: ${(err as Error).message}`
    );
  });

  sendResponse(res, {
    status: HttpStatusCode.OK,
    data: {},
    message: "Your inquiry has been submitted successfully. Our team will contact you soon.",
  });
});
