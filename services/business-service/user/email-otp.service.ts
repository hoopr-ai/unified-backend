import { AppError, redisClient } from "../../helper-service/modules.export";
import { ErrorMessages } from "../../dto-service/constants/modules.export";
import { sendEmail } from "../../helper-service/email.service";
import { logger } from "../../helper-service/logger";

// OTP Configuration
const OTP_LENGTH = 6;
const OTP_TTL_SECONDS = 300; // 5 minutes
const MAX_RESEND_ATTEMPTS = 5;
const RESEND_WINDOW_SECONDS = 3600; // 1 hour
const MAX_VERIFY_ATTEMPTS = 5;
const BLOCK_DURATION_SECONDS = 1800; // 30 minutes

// Redis key prefixes
const KEY_OTP = (email: string) => `email_otp:${email.toLowerCase()}`;
const KEY_RESEND_ATTEMPTS = (email: string) =>
  `email_otp:resend_attempts:${email.toLowerCase()}`;
const KEY_VERIFY_ATTEMPTS = (email: string) =>
  `email_otp:verify_attempts:${email.toLowerCase()}`;
const KEY_BLOCK = (email: string) => `email_otp:block:${email.toLowerCase()}`;

const generateOtp = (): string => {
  return Math.floor(
    10 ** (OTP_LENGTH - 1) + Math.random() * 9 * 10 ** (OTP_LENGTH - 1),
  ).toString();
};

const validateEmail = (email: string): void => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    throw new AppError("Invalid email address", 400);
  }
};

const generateEmailHtml = (otp: string, email: string): string => {
  return `
    <html>
      <head>
        <meta charset="UTF-8">
        <meta http-equiv="X-UA-Compatible" content="IE=edge">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Your Hoopr Smash email verification code</title>
        <style type="text/css">
          a {
            text-decoration: none;
          }
          body {
            font-family: "Open Sans", "Helvetica", sans-serif;
            letter-spacing: -0.25px;
            line-height: 1.7;
          }
          .aIcon {
            text-decoration: none;
            padding: 0px 10px;
          }
          .bgSmash {
            background-color: #F84451;
          }
          .bgYellow {
            background-color: #F6F8ED;
          }
          .footer {
            padding: 30px 30px 20px;
            border-radius: 10px;
          }
          .footerIcon {
            padding: 10px 0px;
          }
          .footerL {
            font-size: 12px;
            color: #FFFFFF;
            line-height: 1.5;
            border-right: 1px solid #FFFFFF;
            width: 50%;
          }
          .footerR {
            font-size: 12px;
            color: #FFFFFF;
            line-height: 1.5;
            width: 50%;
          }
          .header {
            padding: 40px 30px;
          }
          .logo {
            width: 100px;
            height: auto;
          }
          p {
            margin: 0;
            padding: 0;
          }
          .p30 {
            padding: 30px;
          }
          .p30l {
            padding-left: 30px;
          }
          .p30lr {
            padding: 0px 30px;
          }
          .p30tb {
            padding: 30px 0px;
          }
          .smashRed {
            color: #F84451;
          }
          .table {
            max-width: 640px;
            width: 100%;
            padding: 0 20px;
            border-spacing: 0;
            border-collapse: collapse;
            margin: 0 auto;
          }
          .otp {
            font-size: 30px;
            font-weight: bold;
            padding: 0px 10px;
            letter-spacing: 10px;
          }
          .bold {
            font-weight: bold;
          }
          .normal {
            font-size: 16px;
          }
          .sub-text {
            font-size: 12px;
            color: #666666;
            line-height: 2;
          }
        </style>
      </head>
      <body>
        <table class="table" cellspacing="0">
          <tr>
            <td colspan="12" class="header">
              <img class="logo" src='https://cdn.hooprsmash.com/web/logos/smash-bright.png' width='100px' />
            </td>
          </tr>
          <tr>
            <td colspan="12" class="p30">
              <span class="normal">
                You requested a verification code for your email address.
              </span>
            </td>
          </tr>
          <tr>
            <td colspan="12" class="p30 bgYellow" align="center">
              <span class="normal">Here is your verification code</span>
              <p class="smashRed otp">${otp}</p>
            </td>
          </tr>
          <tr>
            <td colspan="12" class="p30">
              <span class="sub-text">
                This code will be valid for the next 5 minutes.
                Please do not share this code with anyone.<br/>
                You can safely ignore this email if you did not request a verification code.
              </span>
            </td>
          </tr>
          <tr>
            <td colspan="12">
              <div class="bgSmash footer">
                <table class="table" align="center" cellspacing="0">
                  <tr>
                    <td colspan="6" class="footerL" align="center">
                      For any queries or customer support,
                      <br/> you can reach us on
                    </td>
                    <td colspan="6" class="footerR" align="center">
                      Follow us for
                      <br/>the latest updates
                    </td>
                  </tr>
                  <tr>
                    <td colspan="6" class="footerL footerIcon" align="center">
                      <a href="tel:+917400226274" class="aIcon">
                        <img src="https://cdn.hooprsmash.com/emailers/icons/call-white.png" alt="call" width="28px" />
                      </a>
                      <a href="mailto:smashsupport@gsharp.media" class="aIcon">
                        <img src="https://cdn.hooprsmash.com/emailers/icons/email-white.png" alt="email" width="28px" />
                      </a>
                      <a href="https://wa.me/7400226274" class="aIcon">
                        <img src="https://cdn.hooprsmash.com/emailers/icons/whatsapp-wr.png" alt="whatsapp" width="28px" />
                      </a>
                    </td>
                    <td colspan="6" class="footerR footerIcon" align="center">
                      <a href="https://www.instagram.com/hooprsmash" class="aIcon">
                        <img src="https://cdn.hooprsmash.com/emailers/icons/ig-white.png" alt="instagram" height="36px" />
                      </a>
                      <a href="https://www.youtube.com/@hoopr" class="aIcon">
                        <img src="https://cdn.hooprsmash.com/emailers/icons/yt-c-white.png" alt="youtube" width="36px" />
                      </a>
                      <a href="https://www.facebook.com/hoopr.official/" class="aIcon">
                        <img src="https://cdn.hooprsmash.com/emailers/icons/fb-white.png" alt="facebook" height="34px" />
                      </a>
                    </td>
                  </tr>
                </table>
              </div>
            </td>
          </tr>
          <tr>
            <td>&nbsp;</td>
          </tr>
          <tr>
            <td colspan="12" class="p30lr">
              <span class="sub-text">
                You are receiving this email as part of the verification process on Hoopr Smash. This email was sent to: ${email}. If you received this email at a different address, this email was most likely forwarded to you.
              </span>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `;
};

export interface SendEmailOtpData {
  email: string;
  type?: "R"; // R for resend
}

export interface VerifyEmailOtpData {
  email: string;
  otp: string;
}

export const sendEmailOtpService = async (
  data: SendEmailOtpData,
): Promise<Record<string, never>> => {
  const { email } = data;
  const lowerEmail = email.toLowerCase().trim();

  validateEmail(lowerEmail);

  // Check resend rate limit
  const resendAttempts = parseInt(
    (await redisClient.get(KEY_RESEND_ATTEMPTS(lowerEmail))) || "0",
    10,
  );
  if (resendAttempts >= MAX_RESEND_ATTEMPTS) {
    throw new AppError(
      `You have exceeded the OTP resend limit. Please try again after ${RESEND_WINDOW_SECONDS / 60} minutes.`,
      429,
    );
  }

  // Invalidate existing OTP
  await redisClient.del(KEY_OTP(lowerEmail));

  // Generate and store new OTP
  const otp = generateOtp();
  await redisClient.set(KEY_OTP(lowerEmail), otp, "EX", OTP_TTL_SECONDS);

  // Increment resend counter
  await redisClient.set(
    KEY_RESEND_ATTEMPTS(lowerEmail),
    (resendAttempts + 1).toString(),
    "EX",
    RESEND_WINDOW_SECONDS,
  );

  // Send email
  try {
    const emailSubject =
      (process.env.NODE_ENV !== "production" ? "DEV: " : "") +
      "Your Hoopr Smash email verification code";
    const emailHtml = generateEmailHtml(otp, lowerEmail);

    await sendEmail({
      to: lowerEmail,
      subject: emailSubject,
      html: emailHtml,
    });
  } catch (err) {
    logger.error("Failed to send OTP email", {
      email: lowerEmail,
      error: (err as Error).message,
    });
    throw new AppError(
      ErrorMessages.OtpSendFailed || "Failed to send OTP email",
      500,
    );
  }

  logger.info("Email OTP sent", { email: lowerEmail });
  return {};
};

export const verifyEmailOtpService = async (
  data: VerifyEmailOtpData,
): Promise<Record<string, never>> => {
  const { email, otp } = data;
  const lowerEmail = email.toLowerCase().trim();

  validateEmail(lowerEmail);

  // Check if email is blocked
  const isBlocked = await redisClient.get(KEY_BLOCK(lowerEmail));
  if (isBlocked) {
    throw new AppError(
      `Email temporarily locked. Try again in ${BLOCK_DURATION_SECONDS / 60} minutes.`,
      429,
    );
  }

  // Get stored OTP
  const storedOtp = await redisClient.get(KEY_OTP(lowerEmail));
  if (!storedOtp) {
    throw new AppError(
      ErrorMessages.OtpExpiredOrNotFound ||
        "OTP expired or not found. Please request a new OTP.",
      400,
    );
  }

  if (storedOtp === otp) {
    // OTP valid — clean up
    await redisClient.del(KEY_OTP(lowerEmail));
    await redisClient.del(KEY_VERIFY_ATTEMPTS(lowerEmail));
    await redisClient.del(KEY_RESEND_ATTEMPTS(lowerEmail));

    logger.info("Email OTP verified", { email: lowerEmail });
    return {};
  }

  // Wrong OTP — increment attempts
  const attempts =
    parseInt(
      (await redisClient.get(KEY_VERIFY_ATTEMPTS(lowerEmail))) || "0",
      10,
    ) + 1;

  if (attempts >= MAX_VERIFY_ATTEMPTS) {
    // Block the email
    await redisClient.set(
      KEY_BLOCK(lowerEmail),
      "1",
      "EX",
      BLOCK_DURATION_SECONDS,
    );
    await redisClient.del(KEY_OTP(lowerEmail));
    await redisClient.del(KEY_VERIFY_ATTEMPTS(lowerEmail));

    throw new AppError(
      `Email temporarily locked. Try again in ${BLOCK_DURATION_SECONDS / 60} minutes.`,
      429,
    );
  }

  await redisClient.set(
    KEY_VERIFY_ATTEMPTS(lowerEmail),
    attempts.toString(),
    "EX",
    BLOCK_DURATION_SECONDS,
  );

  const remaining = MAX_VERIFY_ATTEMPTS - attempts;
  throw new AppError(
    `Invalid OTP. ${remaining} attempt${remaining === 1 ? "" : "s"} left.`,
    400,
  );
};
