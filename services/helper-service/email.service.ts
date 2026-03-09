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

interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
}

export const sendEmail = async (options: SendEmailOptions): Promise<void> => {
  const mailOptions = {
    from: `"Hoopr" <${process.env.SMTP_FROM || process.env.SMTP_USER || "infra@gsharp.media"}>`,
    to: options.to,
    subject: options.subject,
    html: options.html,
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
                  <img src="https://storage.googleapis.com/dev-enterprise/web/logos/Hoopr%20Logo%20SVG%20(2).png" alt="Hoopr" style="max-width:150px; height:auto; display:block;" />
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
  const { recipientFirstName, trackName, assortmentType, creditsRemaining, downloadedByFullName } = data;
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
                  <img src="https://storage.googleapis.com/dev-enterprise/web/logos/Hoopr%20Logo%20SVG%20(2).png" alt="Hoopr" style="max-width:150px; height:auto; display:block;" />
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
                    <tr>
                      <td style="font-size:15px; padding:5px 0; color:#333;">
                        <strong>${assortmentType} Credits Remaining:</strong> ${creditsRemaining}
                      </td>
                    </tr>
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
                  <img src="https://storage.googleapis.com/dev-enterprise/web/logos/Hoopr%20Logo%20SVG%20(2).png" alt="Hoopr" style="max-width:150px; height:auto; display:block;" />
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
                  <img src="https://storage.googleapis.com/dev-enterprise/web/logos/Hoopr%20Logo%20SVG%20(2).png" alt="Hoopr" style="max-width:150px; height:auto; display:block;" />
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
                  <img src="https://storage.googleapis.com/dev-enterprise/web/logos/Hoopr%20Logo%20SVG%20(2).png" alt="Hoopr" style="max-width:150px; height:auto; display:block;" />
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
                  <p style="margin:0 0 16px 0; font-size:15px; color:#333; line-height:1.7;">
                    <strong>Credits Left:</strong> ${creditsRemaining}
                  </p>
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
                  <img src="https://storage.googleapis.com/dev-enterprise/web/logos/Hoopr%20Logo%20SVG%20(2).png" alt="Hoopr" style="max-width:150px; height:auto; display:block;" />
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
