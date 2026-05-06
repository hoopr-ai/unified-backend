import { sendEmail } from "../../helper-service/email.service";

interface InternalCredentialsEmailParams {
  firstName: string;
  email: string;
  tempPassword: string;
  loginUrl: string;
  isReset: boolean;
}

const buildHtml = (p: InternalCredentialsEmailParams): string => {
  const headline = p.isReset
    ? "Your Hoopr internal password has been reset"
    : "Welcome to Hoopr — your internal account is ready";
  const opening = p.isReset
    ? "An admin has reset your Hoopr internal CMS password. Use the temporary password below to log in."
    : "Your Hoopr internal CMS account has been created. Use the temporary password below to log in for the first time.";

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8" />
      <title>${headline}</title>
    </head>
    <body style="margin:0; padding:0; background-color:#f4f4f4; font-family: Arial, Helvetica, sans-serif;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f4; padding:30px 0;">
        <tr><td align="center">
          <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff; border-radius:8px; overflow:hidden; box-shadow:0 2px 6px rgba(0,0,0,0.08);">
            <tr><td align="center" style="padding:30px 20px 10px 20px;">
              <img src="https://storage.googleapis.com/cdn-hooprsmash-com-prod/enterprise/web/logos/HooprSmash.png" alt="Hoopr" style="max-width:150px; height:auto; display:block;" />
            </td></tr>
            <tr><td align="center" style="padding:10px 40px;">
              <h1 style="margin:0; font-size:24px; color:#1a1a1a;">${headline}</h1>
            </td></tr>
            <tr><td style="padding:20px 40px 10px 40px;">
              <p style="margin:0 0 16px 0; font-size:15px; color:#333; line-height:1.7;">Hey ${p.firstName},</p>
              <p style="margin:0 0 16px 0; font-size:15px; color:#333; line-height:1.7;">${opening}</p>
            </td></tr>
            <tr><td style="padding:0 40px 20px 40px;">
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#f7f7f7; border-radius:6px; padding:20px;">
                <tr><td style="font-size:15px; padding:4px 0; color:#333;">
                  <strong>Login URL:</strong> <a href="${p.loginUrl}" style="color:#ff2f63; text-decoration:none;">${p.loginUrl}</a>
                </td></tr>
                <tr><td style="font-size:15px; padding:4px 0; color:#333;"><strong>Email:</strong> ${p.email}</td></tr>
                <tr><td style="font-size:15px; padding:4px 0; color:#333;"><strong>Temporary password:</strong> <code style="font-family: 'Courier New', monospace; background:#fff; padding:2px 6px; border-radius:3px;">${p.tempPassword}</code></td></tr>
              </table>
            </td></tr>
            <tr><td align="center" style="padding:10px 40px 20px 40px;">
              <a href="${p.loginUrl}" style="display:inline-block; background-color:#ff2f63; color:#ffffff; text-decoration:none; padding:14px 36px; font-size:16px; border-radius:6px; font-weight:600;">Log in</a>
            </td></tr>
            <tr><td style="padding:0 40px 25px 40px;">
              <p style="margin:0 0 10px 0; font-size:14px; color:#666; line-height:1.7;">
                This password is single-use until you reset it. Please log in and change it from your profile.
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
};

// Single parameterised email used for both "create" and "reset" flows.
// isReset=true swaps the subject + opening copy per spec.
// Returns true if the SMTP send succeeded, false otherwise. Caller decides what to do
// with the failure — for the spec's intent (still return 201 even if email failed),
// we never want this throw to abort the create.
export const sendInternalUserCredentialsEmail = async (
  params: InternalCredentialsEmailParams
): Promise<boolean> => {
  const subject = params.isReset
    ? "Your Hoopr internal password has been reset"
    : "Welcome to Hoopr — your internal account is ready";
  try {
    await sendEmail({
      to: params.email,
      subject,
      html: buildHtml(params),
    });
    return true;
  } catch {
    return false;
  }
};
