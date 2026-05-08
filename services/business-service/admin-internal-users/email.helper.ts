import { sendEmail } from "../../helper-service/email.service";

interface InternalUserWelcomeEmailParams {
  firstName: string;
  email: string;
  loginUrl: string;
}

// Sent when an admin creates a new INTERNAL employee. v2 design: no password is shipped to
// the user — login is OTP-based. The body just announces the account and points them at the
// CMS URL where they enter their email and receive a one-time code.
const buildWelcomeHtml = (p: InternalUserWelcomeEmailParams): string => `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8" />
      <title>Welcome to Hoopr — your internal account is ready</title>
    </head>
    <body style="margin:0; padding:0; background-color:#f4f4f4; font-family: Arial, Helvetica, sans-serif;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f4; padding:30px 0;">
        <tr><td align="center">
          <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff; border-radius:8px; overflow:hidden; box-shadow:0 2px 6px rgba(0,0,0,0.08);">
            <tr><td align="center" style="padding:30px 20px 10px 20px;">
              <img src="https://storage.googleapis.com/cdn-hooprsmash-com-prod/enterprise/web/logos/HooprSmash.png" alt="Hoopr" style="max-width:150px; height:auto; display:block;" />
            </td></tr>
            <tr><td align="center" style="padding:10px 40px;">
              <h1 style="margin:0; font-size:24px; color:#1a1a1a;">Welcome to Hoopr</h1>
            </td></tr>
            <tr><td style="padding:20px 40px 10px 40px;">
              <p style="margin:0 0 16px 0; font-size:15px; color:#333; line-height:1.7;">Hey ${p.firstName},</p>
              <p style="margin:0 0 16px 0; font-size:15px; color:#333; line-height:1.7;">
                Your Hoopr internal CMS account has been created. Logging in is passwordless — open the CMS, enter your email, and we'll send you a one-time code.
              </p>
            </td></tr>
            <tr><td style="padding:0 40px 20px 40px;">
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#f7f7f7; border-radius:6px; padding:20px;">
                <tr><td style="font-size:15px; padding:4px 0; color:#333;">
                  <strong>Login URL:</strong> <a href="${p.loginUrl}" style="color:#ff2f63; text-decoration:none;">${p.loginUrl}</a>
                </td></tr>
                <tr><td style="font-size:15px; padding:4px 0; color:#333;"><strong>Your email:</strong> ${p.email}</td></tr>
              </table>
            </td></tr>
            <tr><td align="center" style="padding:10px 40px 20px 40px;">
              <a href="${p.loginUrl}" style="display:inline-block; background-color:#ff2f63; color:#ffffff; text-decoration:none; padding:14px 36px; font-size:16px; border-radius:6px; font-weight:600;">Open the CMS</a>
            </td></tr>
            <tr><td style="padding:0 40px 25px 40px;">
              <p style="margin:0 0 10px 0; font-size:14px; color:#666; line-height:1.7;">
                If you'd rather use a password later, you can set one yourself from the profile screen — no admin needed.
              </p>
              <p style="margin:0; font-size:15px; color:#333; line-height:1.7;">Regards,<br/>Team Hoopr</p>
            </td></tr>
          </table>
          <table width="600" cellpadding="0" cellspacing="0">
            <tr><td align="center" style="padding:20px; font-size:12px; color:#aaa;">
              This is an automated email. Please do not reply.
            </td></tr>
          </table>
        </td></tr>
      </table>
    </body>
    </html>
  `;

// Returns true if the SMTP send succeeded, false otherwise. Never throws — a transient SMTP
// failure must not abort the create operation; the user record exists either way.
export const sendInternalUserWelcomeEmail = async (
  params: InternalUserWelcomeEmailParams
): Promise<boolean> => {
  try {
    await sendEmail({
      to: params.email,
      subject: "Welcome to Hoopr — your internal account is ready",
      html: buildWelcomeHtml(params),
    });
    return true;
  } catch {
    return false;
  }
};
