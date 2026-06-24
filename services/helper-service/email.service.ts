import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 587,
  secure: false,
  auth: {
    user: "infra@gsharp.media",
    pass: "tbdp wxgb pgty amjm",
  },
});

interface EmailAttachment {
  filename: string;
  content: Buffer;
  contentType: string;
}

interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  attachments?: EmailAttachment[];
}

export const sendEmail = async (options: SendEmailOptions): Promise<void> => {
  const mailOptions = {
    from: `"Hoopr" <${process.env.SMTP_FROM || process.env.SMTP_USER || "infra@gsharp.media"}>`,
    to: options.to,
    subject: options.subject,
    html: options.html,
    attachments: options.attachments,
  };

  await transporter.sendMail(mailOptions);
};

export const sendWelcomeEmail = async (
  email: string,
  password: string,
  loginUrl: string,
): Promise<void> => {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #4A90D9; color: white; padding: 20px; text-align: center; }
        .content { padding: 20px; background-color: #f9f9f9; }
        .credentials { background-color: #fff; padding: 15px; border-radius: 5px; margin: 15px 0; }
        .credentials p { margin: 5px 0; }
        .button { display: inline-block; padding: 12px 24px; background-color: #4A90D9; color: white; text-decoration: none; border-radius: 5px; margin-top: 15px; }
        .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Welcome!</h1>
        </div>
        <div class="content">
          <p>Your account has been created successfully. Here are your login credentials:</p>
          <div class="credentials">
            <p><strong>Email:</strong> ${email}</p>
            <p><strong>Password:</strong> ${password}</p>
          </div>
          <p>Please login and complete your profile to get started.</p>
          <a href="${loginUrl}" class="button">Login Now</a>
          <p style="margin-top: 20px; color: #666; font-size: 12px;">
            For security reasons, we recommend changing your password after your first login.
          </p>
        </div>
        <div class="footer">
          <p>This is an automated email. Please do not reply.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  await sendEmail({
    to: email,
    subject: "Welcome - Your Account Has Been Created",
    html,
  });
};

export const sendInviteEmail = async (
  email: string,
  password: string,
  brandName: string,
  inviterName?: string,
): Promise<void> => {
  const frontendUrl = process.env.FRONTEND_URL || "https://smash.hoopr.ai";

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8" />
      <title>You have been invited to join a team</title>
    </head>

    <body style="margin:0; padding:0; background-color:#f4f4f4; font-family: Arial, Helvetica, sans-serif;">

      <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f4; padding:30px 0;">
        <tr>
          <td align="center">

            <!-- Main Container -->
            <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff; border-radius:8px; overflow:hidden; box-shadow:0 2px 6px rgba(0,0,0,0.08);">

              <!-- Logo -->
              <tr>
                <td align="center" style="padding:30px 20px 10px 20px;">
                  <img src="https://storage.googleapis.com/cdn-hooprsmash-com-prod/enterprise/web/logos/HooprSmash.png" alt="Hoopr" style="max-width:150px; height:auto; display:block;" />
                </td>
              </tr>

              <!-- Title -->
              <tr>
                <td align="center" style="padding:10px 40px;">
                  <h1 style="margin:0; font-size:26px; color:#1a1a1a;">
                    You have been invited to join a team
                  </h1>
                </td>
              </tr>

              <!-- Body -->
              <tr>
                <td style="padding:20px 40px 10px 40px;">
                  <p style="margin:0 0 16px 0; font-size:15px; color:#333; line-height:1.7;">
                    Hey,
                  </p>
                  <p style="margin:0 0 16px 0; font-size:15px; color:#333; line-height:1.7;">
                    ${inviterName ? `<strong>${inviterName}</strong> has invited you to join their team <strong>${brandName}</strong> on Hoopr Smash.` : `You have been invited to join the team <strong>${brandName}</strong> on Hoopr Smash.`}
                  </p>
                  <p style="margin:0 0 16px 0; font-size:15px; color:#333; line-height:1.7;">
                    To join, use the credentials below:
                  </p>
                </td>
              </tr>

              <!-- Credentials Box -->
              <tr>
                <td style="padding:0 40px 20px 40px;">
                  <table width="100%" cellpadding="0" cellspacing="0"
                    style="background:#f7f7f7; border-radius:6px; padding:20px;">
                    <tr>
                      <td style="font-size:15px; padding:4px 0; color:#333;">
                        <strong>Platform URL:</strong> <a href="${frontendUrl}" style="color:#ff2f63; text-decoration:none;">${frontendUrl}</a>
                      </td>
                    </tr>
                    <tr>
                      <td style="font-size:15px; padding:4px 0; color:#333;">
                        <strong>Email:</strong> ${email}
                      </td>
                    </tr>
                    <tr>
                      <td style="font-size:15px; padding:4px 0; color:#333;">
                        <strong>Password:</strong> ${password}
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

              <!-- CTA Button -->
              <tr>
                <td align="center" style="padding:10px 40px 20px 40px;">
                  <a href="${frontendUrl}"
                    style="display:inline-block; background-color:#ff2f63; color:#ffffff;
                          text-decoration:none; padding:14px 36px; font-size:16px;
                          border-radius:6px; font-weight:600;">
                    Login Now
                  </a>
                </td>
              </tr>

              <!-- Footer Message -->
              <tr>
                <td style="padding:0 40px 25px 40px;">
                  <p style="margin:0 0 10px 0; font-size:15px; color:#333; line-height:1.7;">
                    In case you need any help, feel free to reach out to us at
                    <a href="mailto:hello@hoopr.ai" style="color:#ff2f63; text-decoration:none;">hello@hoopr.ai</a>.
                  </p>
                  <p style="margin:0 0 10px 0; font-size:15px; color:#333; line-height:1.7;">
                    We hope you enjoy using Hoopr Smash.
                  </p>
                  <p style="margin:0; font-size:15px; color:#333; line-height:1.7;">
                    Regards,<br/>Team Hoopr
                  </p>
                </td>
              </tr>

            </table>

            <!-- Footer -->
            <table width="600" cellpadding="0" cellspacing="0">
              <tr>
                <td align="center" style="padding:20px; font-size:12px; color:#aaa;">
                  This is an automated email. Please do not reply.
                </td>
              </tr>
            </table>

          </td>
        </tr>
      </table>

    </body>
    </html>
  `;

  await sendEmail({
    to: email,
    subject: `Hoopr Smash - Invitation from ${inviterName || brandName}`,
    html,
  });
};

export const sendTrackDownloadNotificationEmail = async (
  recipientEmail: string,
  data: {
    recipientFirstName: string;
    trackName: string;
    assortmentType: string;
    creditsRemaining: number;
    downloadedByFullName: string;
  },
): Promise<void> => {
  const {
    recipientFirstName,
    trackName,
    assortmentType,
    creditsRemaining,
    downloadedByFullName,
  } = data;
  const frontendUrl = process.env.FRONTEND_URL || "https://smash.hoopr.ai";

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8" />
      <title>New Track Downloaded</title>
    </head>

    <body style="margin:0; padding:0; background-color:#f4f4f4; font-family: Arial, Helvetica, sans-serif;">

      <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f4; padding:30px 0;">
        <tr>
          <td align="center">

            <!-- Main Container -->
            <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff; border-radius:8px; overflow:hidden; box-shadow:0 2px 6px rgba(0,0,0,0.08);">

              <!-- Logo -->
              <tr>
                <td align="center" style="padding:30px 20px 10px 20px;">
                  <img src="https://storage.googleapis.com/cdn-hooprsmash-com-prod/enterprise/web/logos/HooprSmash.png" alt="Hoopr" style="max-width:150px; height:auto; display:block;" />
                </td>
              </tr>

              <!-- Title -->
              <tr>
                <td align="center" style="padding:10px 40px;">
                  <h1 style="margin:0; font-size:26px; color:#1a1a1a;">
                    New Track Downloaded: ${trackName}
                  </h1>
                </td>
              </tr>

              <!-- Body -->
              <tr>
                <td style="padding:20px 40px 10px 40px;">
                  <p style="margin:0 0 16px 0; font-size:15px; color:#333; line-height:1.7;">
                    Hey ${recipientFirstName},
                  </p>
                  <p style="margin:0 0 16px 0; font-size:15px; color:#333; line-height:1.7;">
                    A new track <strong>${trackName}</strong> has just been downloaded from your Hoopr Smash team account.
                  </p>
                </td>
              </tr>

              <!-- Track Details Box -->
              <tr>
                <td style="padding:0 40px 20px 40px;">
                  <table width="100%" cellpadding="0" cellspacing="0"
                    style="background:#f7f7f7; border-radius:6px; padding:20px;">
                    <tr>
                      <td style="font-size:15px; padding:5px 0; color:#333;">
                        <strong>Track Name:</strong> ${trackName}
                      </td>
                    </tr>
                    <tr>
                      <td style="font-size:15px; padding:5px 0; color:#333;">
                        <strong>Track Category:</strong> ${assortmentType}
                      </td>
                    </tr>
                    ${
                      assortmentType !== "Hoopr Originals"
                        ? `
                    <tr>
                      <td style="font-size:15px; padding:5px 0; color:#333;">
                        <strong>${assortmentType} Credits Remaining:</strong> ${creditsRemaining}
                      </td>
                    </tr>`
                        : ""
                    }
                    <tr>
                      <td style="font-size:15px; padding:5px 0; color:#333;">
                        <strong>Downloaded By:</strong> ${downloadedByFullName}
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

              <!-- Note -->
              <tr>
                <td style="padding:0 40px 20px 40px;">
                  <p style="margin:0; font-size:15px; color:#333; line-height:1.7;">
                    Note: Add links of your content pieces once you have used the track to ensure compliance.
                  </p>
                </td>
              </tr>

              <!-- CTA Button -->
              <tr>
                <td align="center" style="padding:10px 40px 20px 40px;">
                  <a href="${frontendUrl}"
                    style="display:inline-block; background-color:#ff2f63; color:#ffffff;
                          text-decoration:none; padding:14px 36px; font-size:16px;
                          border-radius:6px; font-weight:600;">
                    View Downloads
                  </a>
                </td>
              </tr>

              <!-- Footer Message -->
              <tr>
                <td style="padding:0 40px 25px 40px;">
                  <p style="margin:0 0 10px 0; font-size:15px; color:#333; line-height:1.7;">
                    In case you need any help, feel free to reach out to us at
                    <a href="mailto:hello@hoopr.ai" style="color:#ff2f63; text-decoration:none;">hello@hoopr.ai</a>.
                  </p>
                  <p style="margin:0 0 10px 0; font-size:15px; color:#333; line-height:1.7;">
                    We hope you are enjoying using Hoopr Smash.
                  </p>
                  <p style="margin:0; font-size:15px; color:#333; line-height:1.7;">
                    Regards,<br/>Team Hoopr
                  </p>
                </td>
              </tr>

            </table>

            <!-- Footer -->
            <table width="600" cellpadding="0" cellspacing="0">
              <tr>
                <td align="center" style="padding:20px; font-size:12px; color:#aaa;">
                  This is an automated email. Please do not reply.
                </td>
              </tr>
            </table>

          </td>
        </tr>
      </table>

    </body>
    </html>
  `;

  await sendEmail({
    to: recipientEmail,
    subject: `Hoopr Smash - New Track Downloaded`,
    html,
  });
};

export const sendTeamJoinNotificationEmail = async (
  recipientEmail: string,
  recipientFirstName: string,
  newMemberFirstName: string,
): Promise<void> => {
  const frontendUrl = process.env.FRONTEND_URL || "https://smash.hoopr.ai";

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8" />
      <title>New member has joined your team</title>
    </head>

    <body style="margin:0; padding:0; background-color:#f4f4f4; font-family: Arial, Helvetica, sans-serif;">

      <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f4; padding:30px 0;">
        <tr>
          <td align="center">

            <!-- Main Container -->
            <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff; border-radius:8px; overflow:hidden; box-shadow:0 2px 6px rgba(0,0,0,0.08);">

              <!-- Logo -->
              <tr>
                <td align="center" style="padding:30px 20px 10px 20px;">
                  <img src="https://storage.googleapis.com/cdn-hooprsmash-com-prod/enterprise/web/logos/HooprSmash.png" alt="Hoopr" style="max-width:150px; height:auto; display:block;" />
                </td>
              </tr>

              <!-- Title -->
              <tr>
                <td align="center" style="padding:10px 40px;">
                  <h1 style="margin:0; font-size:26px; color:#1a1a1a;">
                    New member has joined your team
                  </h1>
                </td>
              </tr>

              <!-- Body -->
              <tr>
                <td style="padding:20px 40px 10px 40px;">
                  <p style="margin:0 0 16px 0; font-size:15px; color:#333; line-height:1.7;">
                    Hey ${recipientFirstName},
                  </p>
                  <p style="margin:0 0 16px 0; font-size:15px; color:#333; line-height:1.7;">
                    <strong>${newMemberFirstName}</strong> has joined your team on Hoopr Smash.
                  </p>
                  <p style="margin:0 0 16px 0; font-size:15px; color:#333; line-height:1.7;">
                    They can now use the platform and download tracks.
                  </p>
                  <p style="margin:0 0 16px 0; font-size:15px; color:#333; line-height:1.7;">
                    Invite new members or find the right track for your next content piece.
                  </p>
                </td>
              </tr>

              <!-- CTA Button -->
              <tr>
                <td align="center" style="padding:10px 40px 20px 40px;">
                  <a href="${frontendUrl}"
                    style="display:inline-block; background-color:#ff2f63; color:#ffffff;
                          text-decoration:none; padding:14px 36px; font-size:16px;
                          border-radius:6px; font-weight:600;">
                    Open Hoopr Smash
                  </a>
                </td>
              </tr>

              <!-- Footer Message -->
              <tr>
                <td style="padding:0 40px 25px 40px;">
                  <p style="margin:0 0 10px 0; font-size:15px; color:#333; line-height:1.7;">
                    In case you need any help, feel free to reach out to us at
                    <a href="mailto:hello@hoopr.ai" style="color:#ff2f63; text-decoration:none;">hello@hoopr.ai</a>.
                  </p>
                  <p style="margin:0 0 10px 0; font-size:15px; color:#333; line-height:1.7;">
                    We hope you are enjoying using Hoopr Smash.
                  </p>
                  <p style="margin:0; font-size:15px; color:#333; line-height:1.7;">
                    Regards,<br/>Team Hoopr
                  </p>
                </td>
              </tr>

            </table>

            <!-- Footer -->
            <table width="600" cellpadding="0" cellspacing="0">
              <tr>
                <td align="center" style="padding:20px; font-size:12px; color:#aaa;">
                  This is an automated email. Please do not reply.
                </td>
              </tr>
            </table>

          </td>
        </tr>
      </table>

    </body>
    </html>
  `;

  await sendEmail({
    to: recipientEmail,
    subject: `Hoopr Smash - ${newMemberFirstName} has joined your team`,
    html,
  });
};

export const sendAdminCredentialsEmail = async (
  email: string,
  password: string,
  brandName: string,
): Promise<void> => {
  const frontendUrl = process.env.FRONTEND_URL || "https://smash.hoopr.ai";

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8" />
      <title>Welcome to Hoopr Smash</title>
    </head>

    <body style="margin:0; padding:0; background-color:#f4f4f4; font-family: Arial, Helvetica, sans-serif;">

      <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f4; padding:30px 0;">
        <tr>
          <td align="center">

            <!-- Main Container -->
            <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff; border-radius:8px; overflow:hidden; box-shadow:0 2px 6px rgba(0,0,0,0.08);">

              <!-- Logo -->
              <tr>
                <td align="center" style="padding:30px 20px 10px 20px;">
                  <img src="https://storage.googleapis.com/cdn-hooprsmash-com-prod/enterprise/web/logos/HooprSmash.png" alt="Hoopr" style="max-width:150px; height:auto; display:block;" />
                </td>
              </tr>

              <!-- Body -->
              <tr>
                <td style="padding:20px 40px 10px 40px;">
                  <p style="margin:0 0 16px 0; font-size:15px; color:#333; line-height:1.7;">
                    Hey,
                  </p>
                  <p style="margin:0 0 16px 0; font-size:15px; color:#333; line-height:1.7;">
                    Hoopr Smash account for <strong>${brandName}</strong> has been created.
                  </p>
                  <p style="margin:0 0 16px 0; font-size:15px; color:#333; line-height:1.7;">
                    To access the platform, login using the credentials below:
                  </p>
                </td>
              </tr>

              <!-- Credentials Box -->
              <tr>
                <td style="padding:0 40px 20px 40px;">
                  <table width="100%" cellpadding="0" cellspacing="0"
                    style="background:#f7f7f7; border-radius:6px; padding:20px;">
                    <tr>
                      <td style="font-size:15px; padding:4px 0; color:#333;">
                        <strong>Platform URL:</strong> <a href="${frontendUrl}" style="color:#ff2f63; text-decoration:none;">${frontendUrl}</a>
                      </td>
                    </tr>
                    <tr>
                      <td style="font-size:15px; padding:4px 0; color:#333;">
                        <strong>Email:</strong> ${email}
                      </td>
                    </tr>
                    <tr>
                      <td style="font-size:15px; padding:4px 0; color:#333;">
                        <strong>Password:</strong> ${password}
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

              <!-- CTA Button -->
              <tr>
                <td align="center" style="padding:10px 40px 20px 40px;">
                  <a href="${frontendUrl}"
                    style="display:inline-block; background-color:#ff2f63; color:#ffffff;
                          text-decoration:none; padding:14px 36px; font-size:16px;
                          border-radius:6px; font-weight:600;">
                    Login Now
                  </a>
                </td>
              </tr>

              <!-- Footer Message -->
              <tr>
                <td style="padding:0 40px 25px 40px;">
                  <p style="margin:0 0 10px 0; font-size:15px; color:#333; line-height:1.7;">
                    In case you need any help, feel free to reach out to us at
                    <a href="mailto:hello@hoopr.ai" style="color:#ff2f63; text-decoration:none;">hello@hoopr.ai</a>.
                  </p>
                  <p style="margin:0 0 10px 0; font-size:15px; color:#333; line-height:1.7;">
                    We hope you enjoy using Hoopr Smash.
                  </p>
                  <p style="margin:0; font-size:15px; color:#333; line-height:1.7;">
                    Regards,<br/>Team Hoopr
                  </p>
                </td>
              </tr>

            </table>

            <!-- Footer -->
            <table width="600" cellpadding="0" cellspacing="0">
              <tr>
                <td align="center" style="padding:20px; font-size:12px; color:#aaa;">
                  This is an automated email. Please do not reply.
                </td>
              </tr>
            </table>

          </td>
        </tr>
      </table>

    </body>
    </html>
  `;

  await sendEmail({
    to: email,
    subject: "Welcome to Hoopr Smash",
    html,
  });
};

export const sendLowCreditsAlertEmail = async (
  recipientEmail: string,
  data: {
    recipientFirstName: string;
    assortmentType: string;
    creditsRemaining: number;
  },
): Promise<void> => {
  const { recipientFirstName, assortmentType, creditsRemaining } = data;
  const frontendUrl = process.env.FRONTEND_URL || "https://smash.hoopr.ai";

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8" />
      <title>Credits Running Out</title>
    </head>

    <body style="margin:0; padding:0; background-color:#f4f4f4; font-family: Arial, Helvetica, sans-serif;">

      <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f4; padding:30px 0;">
        <tr>
          <td align="center">

            <!-- Main Container -->
            <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff; border-radius:8px; overflow:hidden; box-shadow:0 2px 6px rgba(0,0,0,0.08);">

              <!-- Logo -->
              <tr>
                <td align="center" style="padding:30px 20px 10px 20px;">
                  <img src="https://storage.googleapis.com/cdn-hooprsmash-com-prod/enterprise/web/logos/HooprSmash.png" alt="Hoopr" style="max-width:150px; height:auto; display:block;" />
                </td>
              </tr>

              <!-- Title -->
              <tr>
                <td align="center" style="padding:10px 40px;">
                  <h1 style="margin:0; font-size:26px; color:#1a1a1a;">
                    ${assortmentType} Credits Running Out: Only ${creditsRemaining} left
                  </h1>
                </td>
              </tr>

              <!-- Body -->
              <tr>
                <td style="padding:20px 40px 10px 40px;">
                  <p style="margin:0 0 16px 0; font-size:15px; color:#333; line-height:1.7;">
                    Hey ${recipientFirstName},
                  </p>
                  <p style="margin:0 0 16px 0; font-size:15px; color:#333; line-height:1.7;">
                    Your Hoopr Smash account is running out of <strong>${assortmentType}</strong> credits.
                  </p>
                  ${
                    assortmentType !== "Hoopr Originals"
                      ? `<p style="margin:0 0 16px 0; font-size:15px; color:#333; line-height:1.7;">
                    <strong>Credits Left:</strong> ${creditsRemaining}
                  </p>`
                      : ""
                  }
                  <p style="margin:0 0 16px 0; font-size:15px; color:#333; line-height:1.7;">
                    Add more credits to keep using <strong>${assortmentType}</strong> tracks. You can directly purchase more from your account.
                  </p>
                </td>
              </tr>

              <!-- CTA Button -->
              <tr>
                <td align="center" style="padding:10px 40px 20px 40px;">
                  <a href="${frontendUrl}"
                    style="display:inline-block; background-color:#ff2f63; color:#ffffff;
                          text-decoration:none; padding:14px 36px; font-size:16px;
                          border-radius:6px; font-weight:600;">
                    Buy Credits
                  </a>
                </td>
              </tr>

              <!-- Footer Message -->
              <tr>
                <td style="padding:0 40px 25px 40px;">
                  <p style="margin:0 0 10px 0; font-size:15px; color:#333; line-height:1.7;">
                    In case you need any help, feel free to reach out to us at
                    <a href="mailto:hello@hoopr.ai" style="color:#ff2f63; text-decoration:none;">hello@hoopr.ai</a>.
                  </p>
                  <p style="margin:0 0 10px 0; font-size:15px; color:#333; line-height:1.7;">
                    We hope you are enjoying using Hoopr Smash.
                  </p>
                  <p style="margin:0; font-size:15px; color:#333; line-height:1.7;">
                    Regards,<br/>Team Hoopr
                  </p>
                </td>
              </tr>

            </table>

            <!-- Footer -->
            <table width="600" cellpadding="0" cellspacing="0">
              <tr>
                <td align="center" style="padding:20px; font-size:12px; color:#aaa;">
                  This is an automated email. Please do not reply.
                </td>
              </tr>
            </table>

          </td>
        </tr>
      </table>

    </body>
    </html>
  `;

  await sendEmail({
    to: recipientEmail,
    subject: "Hoopr Smash - Credits Running Out",
    html,
  });
};

export const sendFirstLoginWelcomeEmail = async (
  email: string,
  firstName: string,
): Promise<void> => {
  const frontendUrl = process.env.FRONTEND_URL || "https://smash.hoopr.ai";

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8" />
      <title>Your account is now ready</title>
    </head>

    <body style="margin:0; padding:0; background-color:#f4f4f4; font-family: Arial, Helvetica, sans-serif;">

      <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f4; padding:30px 0;">
        <tr>
          <td align="center">

            <!-- Main Container -->
            <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff; border-radius:8px; overflow:hidden; box-shadow:0 2px 6px rgba(0,0,0,0.08);">

              <!-- Logo -->
              <tr>
                <td align="center" style="padding:30px 20px 10px 20px;">
                  <img src="https://storage.googleapis.com/cdn-hooprsmash-com-prod/enterprise/web/logos/HooprSmash.png" alt="Hoopr" style="max-width:150px; height:auto; display:block;" />
                </td>
              </tr>

              <!-- Title -->
              <tr>
                <td align="center" style="padding:10px 40px;">
                  <h1 style="margin:0; font-size:26px; color:#1a1a1a;">
                    Your account is now ready to explore Music
                  </h1>
                </td>
              </tr>

              <!-- Body -->
              <tr>
                <td style="padding:20px 40px 10px 40px;">
                  <p style="margin:0 0 16px 0; font-size:15px; color:#333; line-height:1.7;">
                    Hey ${firstName},
                  </p>
                  <p style="margin:0 0 16px 0; font-size:15px; color:#333; line-height:1.7;">
                    You are now all set to explore Hoopr Smash and find the right track for your next content piece.
                  </p>
                  <p style="margin:0 0 16px 0; font-size:15px; color:#333; line-height:1.7;">
                    You can invite more people to your team should you feel the need.
                  </p>
                </td>
              </tr>

              <!-- CTA Button -->
              <tr>
                <td align="center" style="padding:10px 40px 20px 40px;">
                  <a href="${frontendUrl}"
                    style="display:inline-block; background-color:#ff2f63; color:#ffffff;
                          text-decoration:none; padding:14px 36px; font-size:16px;
                          border-radius:6px; font-weight:600;">
                    Open Hoopr Smash
                  </a>
                </td>
              </tr>

              <!-- Footer Message -->
              <tr>
                <td style="padding:0 40px 25px 40px;">
                  <p style="margin:0 0 10px 0; font-size:15px; color:#333; line-height:1.7;">
                    In case you need any help, feel free to reach out to us at
                    <a href="mailto:hello@hoopr.ai" style="color:#ff2f63; text-decoration:none;">hello@hoopr.ai</a>.
                  </p>
                  <p style="margin:0 0 10px 0; font-size:15px; color:#333; line-height:1.7;">
                    We hope you enjoy using Hoopr Smash.
                  </p>
                  <p style="margin:0; font-size:15px; color:#333; line-height:1.7;">
                    Regards,<br/>Team Hoopr
                  </p>
                </td>
              </tr>

            </table>

            <!-- Footer -->
            <table width="600" cellpadding="0" cellspacing="0">
              <tr>
                <td align="center" style="padding:20px; font-size:12px; color:#aaa;">
                  This is an automated email. Please do not reply.
                </td>
              </tr>
            </table>

          </td>
        </tr>
      </table>

    </body>
    </html>
  `;

  await sendEmail({
    to: email,
    subject: "Hoopr Smash - You are all set",
    html,
  });
};

export const sendContactUsEmail = async (data: {
  userName: string;
  userEmail: string;
  mobile?: string;
  brandName?: string;
  message?: string;
}): Promise<void> => {
  const { userName, userEmail, mobile, brandName, message } = data;
  const adminEmails: string[] = []; // TODO: Add admin emails

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8" />
      <title>New Contact Us Inquiry</title>
    </head>

    <body style="margin:0; padding:0; background-color:#f4f4f4; font-family: Arial, Helvetica, sans-serif;">

      <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f4; padding:30px 0;">
        <tr>
          <td align="center">

            <!-- Main Container -->
            <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff; border-radius:8px; overflow:hidden; box-shadow:0 2px 6px rgba(0,0,0,0.08);">

              <!-- Logo -->
              <tr>
                <td align="center" style="padding:30px 20px 10px 20px;">
                  <img src="https://storage.googleapis.com/cdn-hooprsmash-com-prod/enterprise/web/logos/HooprSmash.png" alt="Hoopr" style="max-width:150px; height:auto; display:block;" />
                </td>
              </tr>

              <!-- Title -->
              <tr>
                <td align="center" style="padding:10px 40px;">
                  <h1 style="margin:0; font-size:26px; color:#1a1a1a;">
                    New Contact Us Inquiry
                  </h1>
                </td>
              </tr>

              <!-- Body -->
              <tr>
                <td style="padding:20px 40px 10px 40px;">
                  <p style="margin:0 0 16px 0; font-size:15px; color:#333; line-height:1.7;">
                    A user has submitted a contact inquiry from Hoopr Smash.
                  </p>
                </td>
              </tr>

              <!-- Details Box -->
              <tr>
                <td style="padding:0 40px 20px 40px;">
                  <table width="100%" cellpadding="0" cellspacing="0"
                    style="background:#f7f7f7; border-radius:6px; padding:20px;">
                    <tr>
                      <td style="font-size:15px; padding:5px 0; color:#333;">
                        <strong>Name:</strong> ${userName}
                      </td>
                    </tr>
                    <tr>
                      <td style="font-size:15px; padding:5px 0; color:#333;">
                        <strong>Email:</strong> <a href="mailto:${userEmail}" style="color:#ff2f63; text-decoration:none;">${userEmail}</a>
                      </td>
                    </tr>
                    ${mobile ? `
                    <tr>
                      <td style="font-size:15px; padding:5px 0; color:#333;">
                        <strong>Mobile:</strong> ${mobile}
                      </td>
                    </tr>
                    ` : ""}
                    ${brandName ? `
                    <tr>
                      <td style="font-size:15px; padding:5px 0; color:#333;">
                        <strong>Brand:</strong> ${brandName}
                      </td>
                    </tr>
                    ` : ""}
                    ${message ? `
                    <tr>
                      <td style="font-size:15px; padding:10px 0 5px 0; color:#333;">
                        <strong>Message:</strong>
                      </td>
                    </tr>
                    <tr>
                      <td style="font-size:15px; padding:5px 0; color:#333; line-height:1.6;">
                        ${message}
                      </td>
                    </tr>
                    ` : ""}
                  </table>
                </td>
              </tr>

              <!-- Footer Message -->
              <tr>
                <td style="padding:0 40px 25px 40px;">
                  <p style="margin:0 0 10px 0; font-size:15px; color:#333; line-height:1.7;">
                    Please respond to this inquiry at your earliest convenience.
                  </p>
                  <p style="margin:0; font-size:15px; color:#333; line-height:1.7;">
                    Regards,<br/>Hoopr Smash System
                  </p>
                </td>
              </tr>

            </table>

            <!-- Footer -->
            <table width="600" cellpadding="0" cellspacing="0">
              <tr>
                <td align="center" style="padding:20px; font-size:12px; color:#aaa;">
                  This is an automated email from Hoopr Smash.
                </td>
              </tr>
            </table>

          </td>
        </tr>
      </table>

    </body>
    </html>
  `;

  // Send to all admin emails
  for (const adminEmail of adminEmails) {
    await sendEmail({
      to: adminEmail,
      subject: `Hoopr Smash - Contact Us Inquiry from ${userName}`,
      html,
    });
  }

  // Send confirmation email to user
  const userConfirmationHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8" />
      <title>We Received Your Inquiry</title>
    </head>

    <body style="margin:0; padding:0; background-color:#f4f4f4; font-family: Arial, Helvetica, sans-serif;">

      <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f4; padding:30px 0;">
        <tr>
          <td align="center">

            <!-- Main Container -->
            <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff; border-radius:8px; overflow:hidden; box-shadow:0 2px 6px rgba(0,0,0,0.08);">

              <!-- Logo -->
              <tr>
                <td align="center" style="padding:30px 20px 10px 20px;">
                  <img src="https://storage.googleapis.com/cdn-hooprsmash-com-prod/enterprise/web/logos/HooprSmash.png" alt="Hoopr" style="max-width:150px; height:auto; display:block;" />
                </td>
              </tr>

              <!-- Title -->
              <tr>
                <td align="center" style="padding:10px 40px;">
                  <h1 style="margin:0; font-size:26px; color:#1a1a1a;">
                    We Received Your Inquiry
                  </h1>
                </td>
              </tr>

              <!-- Body -->
              <tr>
                <td style="padding:20px 40px 10px 40px;">
                  <p style="margin:0 0 16px 0; font-size:15px; color:#333; line-height:1.7;">
                    Hey ${userName},
                  </p>
                  <p style="margin:0 0 16px 0; font-size:15px; color:#333; line-height:1.7;">
                    Thank you for reaching out to us. We have received your inquiry and our team will get back to you shortly.
                  </p>
                  ${message ? `
                  <p style="margin:0 0 8px 0; font-size:15px; color:#333; line-height:1.7;">
                    <strong>Your message:</strong>
                  </p>
                  <p style="margin:0 0 16px 0; font-size:15px; color:#666; line-height:1.7; padding:15px; background:#f7f7f7; border-radius:6px;">
                    ${message}
                  </p>
                  ` : ""}
                </td>
              </tr>

              <!-- Footer Message -->
              <tr>
                <td style="padding:0 40px 25px 40px;">
                  <p style="margin:0 0 10px 0; font-size:15px; color:#333; line-height:1.7;">
                    In case you need any urgent help, feel free to reach out to us at
                    <a href="mailto:hello@hoopr.ai" style="color:#ff2f63; text-decoration:none;">hello@hoopr.ai</a>.
                  </p>
                  <p style="margin:0; font-size:15px; color:#333; line-height:1.7;">
                    Regards,<br/>Team Hoopr
                  </p>
                </td>
              </tr>

            </table>

            <!-- Footer -->
            <table width="600" cellpadding="0" cellspacing="0">
              <tr>
                <td align="center" style="padding:20px; font-size:12px; color:#aaa;">
                  This is an automated email. Please do not reply.
                </td>
              </tr>
            </table>

          </td>
        </tr>
      </table>

    </body>
    </html>
  `;

  await sendEmail({
    to: userEmail,
    subject: "Hoopr Smash - We Received Your Inquiry",
    html: userConfirmationHtml,
  });
};

export const sendOtpEmail = async (
  email: string,
  otp: string,
): Promise<void> => {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8" />
      <title>Your Hoopr Smash email verification code</title>
    </head>

    <body style="margin:0; padding:0; background-color:#f4f4f4; font-family: Arial, Helvetica, sans-serif;">

      <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f4; padding:30px 0;">
        <tr>
          <td align="center">

            <!-- Main Container -->
            <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff; border-radius:8px; overflow:hidden; box-shadow:0 2px 6px rgba(0,0,0,0.08);">

              <!-- Logo -->
              <tr>
                <td align="center" style="padding:30px 20px 10px 20px;">
                  <img src="https://storage.googleapis.com/cdn-hooprsmash-com-prod/enterprise/web/logos/HooprSmash.png" alt="Hoopr" style="max-width:150px; height:auto; display:block;" />
                </td>
              </tr>

              <!-- Title -->
              <tr>
                <td align="center" style="padding:10px 40px;">
                  <h1 style="margin:0; font-size:26px; color:#1a1a1a;">
                    Email Verification
                  </h1>
                </td>
              </tr>

              <!-- Body -->
              <tr>
                <td style="padding:20px 40px 10px 40px;">
                  <p style="margin:0 0 16px 0; font-size:15px; color:#333; line-height:1.7;">
                    You requested a verification code for your email address.
                  </p>
                  <p style="margin:0 0 16px 0; font-size:15px; color:#333; line-height:1.7;">
                    Here is your verification code:
                  </p>
                </td>
              </tr>

              <!-- OTP Box -->
              <tr>
                <td align="center" style="padding:20px 40px;">
                  <div style="background:#f7f7f7; border-radius:6px; padding:30px; border:2px solid #ff2f63;">
                    <p style="margin:0; font-size:48px; font-weight:bold; color:#ff2f63; letter-spacing:8px;">
                      ${otp}
                    </p>
                  </div>
                </td>
              </tr>

              <!-- Info -->
              <tr>
                <td style="padding:20px 40px 10px 40px;">
                  <p style="margin:0 0 16px 0; font-size:14px; color:#666; line-height:1.7;">
                    This code will be valid for the next 5 minutes.
                  </p>
                  <p style="margin:0 0 16px 0; font-size:14px; color:#666; line-height:1.7;">
                    Please do not share this code with anyone.
                  </p>
                  <p style="margin:0; font-size:14px; color:#666; line-height:1.7;">
                    You can safely ignore this email if you did not request a verification code.
                  </p>
                </td>
              </tr>

              <!-- Footer Message -->
              <tr>
                <td style="padding:0 40px 25px 40px;">
                  <p style="margin:0 0 10px 0; font-size:15px; color:#333; line-height:1.7;">
                    In case you need any help, feel free to reach out to us at
                    <a href="mailto:hello@hoopr.ai" style="color:#ff2f63; text-decoration:none;">hello@hoopr.ai</a>.
                  </p>
                  <p style="margin:0; font-size:15px; color:#333; line-height:1.7;">
                    Regards,<br/>Team Hoopr
                  </p>
                </td>
              </tr>

            </table>

            <!-- Footer -->
            <table width="600" cellpadding="0" cellspacing="0">
              <tr>
                <td align="center" style="padding:20px; font-size:12px; color:#aaa;">
                  This is an automated email. Please do not reply.
                </td>
              </tr>
            </table>

          </td>
        </tr>
      </table>

    </body>
    </html>
  `;

  await sendEmail({
    to: email,
    subject:
      (process.env.NODE_ENV !== "production" ? "DEV: " : "") +
      "Your Hoopr Smash email verification code",
    html,
  });
};

// ─── Invoice Email ────────────────────────────────────────────────────────────

interface InvoiceEmailItem {
  trackName: string;
  trackCode: string;
  primaryArtists?: string;
  qty: number;
  sellingPrice: number;
  gstPercent: number;
}

export const sendInvoiceEmail = async (params: {
  to: string;
  buyerFirstName?: string;
  transactionId: string;
  orderId: string;
  date: string;
  paymentMethod: string;
  grandTotal: number;
  items: InvoiceEmailItem[];
  pdfBuffer: Buffer;
  invoiceFilename: string;
}): Promise<void> => {
  const {
    to, buyerFirstName, transactionId, orderId, date,
    paymentMethod, grandTotal, items, pdfBuffer, invoiceFilename,
  } = params;

  const formatInr = (n: number) =>
    n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const trackRows = items.map((item) => `
    <tr>
      <td colspan="12" class="p30lr">
        <div class="card">
          <table class="table">
            <tr>
              <td style="width:25%;">
                <img
                  src="https://storage.googleapis.com/cdn-hooprsmash-com/web/tracks/${item.trackCode}.webp"
                  alt="${item.trackName}"
                  class="tImage"
                />
              </td>
              <td colspan="9">
                <span class="tName">${item.trackName}</span><br/>
                ${item.primaryArtists ? `<span class="tArt">${item.primaryArtists}</span><br/>` : ""}
                <span class="tQtyH">Qty: </span><span class="tQty">${item.qty}</span>
              </td>
            </tr>
          </table>
        </div>
      </td>
    </tr>
    <tr><td>&nbsp;</td></tr>
  `).join("");

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8"/>
  <title>Thank you for your purchase on Hoopr</title>
  <style>
    a { text-decoration: none; }
    body { font-family: "Open Sans", "Helvetica", sans-serif; letter-spacing: -0.25px; }
    .aIcon { text-decoration: none; padding: 0 10px; }
    .bgSmash { background-color: #F84451; }
    .bgYellow { background-color: #F6F8ED; }
    .footer { padding: 30px 30px 20px; border-radius: 10px; }
    .footerIcon { padding: 10px 0; }
    .footerL { font-size: 12px; color: #fff; line-height: 1.5; border-right: 1px solid #fff; width: 50%; }
    .footerR { font-size: 12px; color: #fff; line-height: 1.5; width: 50%; }
    .header { padding: 40px 30px; }
    .logo { width: 100px; height: auto; }
    p { margin: 0; padding: 0; }
    .p30 { padding: 30px; }
    .p30lr { padding: 0 30px; line-height: 1.7; }
    .p30tb { padding: 30px 0; }
    .smashRed { color: #F84451; }
    .table { max-width: 640px; width: 100%; padding: 0 20px; border-spacing: 0; border-collapse: collapse; margin: 0 auto; }
    .bold { font-weight: bold; }
    .card { border: 2px solid #CECECE; border-radius: 10px; padding: 10px 10px 5px; }
    .detHeader { font-size: 18px; color: #7D7D7D; padding-left: 30px; line-height: 1.7; }
    .detText { font-size: 18px; }
    .normal { font-size: 16px; line-height: 1.7; }
    .tImage { border-radius: 10px; width: 120px; height: auto; }
    .tName { font-size: 22px; font-weight: bold; line-height: 1; }
    .tArt { font-size: 14px; color: #7D7D7D; line-height: 1; }
    .tQtyH { font-size: 16px; color: #7D7D7D; line-height: 2.5; }
    .tQty { font-size: 16px; font-weight: bold; }
    .sub-text { font-size: 26px; font-weight: bold; }
    .salutation { padding: 60px 30px 20px; font-size: 20px; color: #000; font-weight: bold; }
    .thanks { padding: 30px 30px 0; font-size: 34px; font-weight: bold; letter-spacing: -1px; }
  </style>
</head>
<body>
  <table class="table" cellspacing="0">
    <tr>
      <td colspan="12" class="header bgYellow">
        <img class="logo" src="https://storage.googleapis.com/cdn-hooprsmash-com/web/logos/smash-bright.png" width="100px"/>
      </td>
    </tr>
    <tr>
      <td colspan="12" class="salutation bgYellow">
        <p>Hi ${buyerFirstName || "there"},</p>
      </td>
    </tr>
    <tr>
      <td colspan="12" class="thanks bgYellow bold">
        <p class="smashRed">Thank you for your purchase!</p>
      </td>
    </tr>
    <tr>
      <td colspan="12" class="p30 bgYellow">
        <span class="normal">Your order has been confirmed. Please find your invoice attached to this email.</span>
      </td>
    </tr>

    <!-- Purchase Details -->
    <tr>
      <td colspan="12" class="p30tb">
        <p class="sub-text smashRed p30lr">Purchase Details</p>
      </td>
    </tr>
    <tr>
      <td width="33%"><span class="detHeader">Transaction ID:</span></td>
      <td><span class="detText">${transactionId}</span></td>
    </tr>
    <tr>
      <td width="33%"><span class="detHeader">Order ID:</span></td>
      <td><span class="detText">${orderId}</span></td>
    </tr>
    <tr>
      <td width="33%"><span class="detHeader">Total Amount:</span></td>
      <td><span class="detText">&#8377;${formatInr(grandTotal)}</span></td>
    </tr>
    <tr>
      <td width="33%"><span class="detHeader">Purchase Date:</span></td>
      <td><span class="detText">${date}</span></td>
    </tr>
    <tr>
      <td width="33%"><span class="detHeader">Payment Mode:</span></td>
      <td><span class="detText">${paymentMethod}</span></td>
    </tr>

    <tr><td colspan="12" class="p30"><hr/></td></tr>

    <!-- Track list -->
    <tr>
      <td colspan="12" class="p30tb">
        <p class="sub-text p30lr">Tracks</p>
      </td>
    </tr>
    ${trackRows}

    <!-- Footer -->
    <tr>
      <td colspan="12">
        <div class="bgSmash footer">
          <table class="table" align="center" cellspacing="0">
            <tr>
              <td colspan="6" class="footerL" align="center">
                For any queries or customer support,<br/>you can reach us on
              </td>
              <td colspan="6" class="footerR" align="center">
                Follow us for<br/>the latest updates
              </td>
            </tr>
            <tr>
              <td colspan="6" class="footerL footerIcon" align="center">
                <a href="tel:+917400226274" class="aIcon">
                  <img src="https://storage.googleapis.com/cdn-hooprsmash-com/emailers/icons/call-white.png" alt="call" width="28px"/>
                </a>
                <a href="mailto:smashsupport@gsharp.media" class="aIcon">
                  <img src="https://storage.googleapis.com/cdn-hooprsmash-com/emailers/icons/email-white.png" alt="email" width="28px"/>
                </a>
                <a href="https://wa.me/7400226274" class="aIcon">
                  <img src="https://storage.googleapis.com/cdn-hooprsmash-com/emailers/icons/whatsapp-wr.png" alt="whatsapp" width="28px"/>
                </a>
              </td>
              <td colspan="6" class="footerR footerIcon" align="center">
                <a href="https://www.instagram.com/hooprsmash" class="aIcon">
                  <img src="https://storage.googleapis.com/cdn-hooprsmash-com/emailers/icons/ig-white.png" alt="instagram" height="36px"/>
                </a>
                <a href="https://www.youtube.com/@hoopr" class="aIcon">
                  <img src="https://storage.googleapis.com/cdn-hooprsmash-com/emailers/icons/yt-c-white.png" alt="youtube" width="36px"/>
                </a>
                <a href="https://www.facebook.com/hoopr.official/" class="aIcon">
                  <img src="https://storage.googleapis.com/cdn-hooprsmash-com/emailers/icons/fb-white.png" alt="facebook" height="34px"/>
                </a>
              </td>
            </tr>
          </table>
        </div>
      </td>
    </tr>
    <tr><td>&nbsp;</td></tr>
  </table>
</body>
</html>`;

  await sendEmail({
    to,
    subject: (process.env.NODE_ENV !== "production" ? "DEV: " : "") +
      "Thank you for your purchase on Hoopr Smash",
    html,
    attachments: [{ filename: invoiceFilename, content: pdfBuffer, contentType: "application/pdf" }],
  });
};
