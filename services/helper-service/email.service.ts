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
  loginUrl: string,
  inviterName?: string,
): Promise<void> => {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8" />
      <title>Your Invite is Here</title>
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
                    You've been added to a Hoopr Enterprise team
                  </h1>
                </td>
              </tr>

              <!-- Subtitle -->
              <tr>
                <td align="center" style="padding:10px 40px 25px 40px;">
                  <p style="margin:0; font-size:15px; color:#666; line-height:1.6;">
                    ${inviterName ? `<strong>${inviterName}</strong> has invited you to join their team on Hoopr Enterprise.` : `You have been invited to join a team on Hoopr Enterprise.`}<br/><br/>
                    Once you accept, you'll be able to access Hoopr's catalog and download tracks based on the permissions assigned to you.<br/><br/>
                    Accept the invitation to get started.
                  </p>
                </td>
              </tr>

              <!-- Credentials Box -->
              <tr>
                <td style="padding:0 40px;">
                  <table width="100%" cellpadding="0" cellspacing="0"
                    style="background:#f7f7f7; border-radius:6px; padding:20px;">
                    <tr>
                      <td style="font-size:16px; font-weight:600; color:#333; padding-bottom:10px;">
                        Account Credentials
                      </td>
                    </tr>

                    <tr>
                      <td style="font-size:14px; color:#777; padding-bottom:15px;">
                        Use these details to access your account
                      </td>
                    </tr>

                    <tr>
                      <td style="font-size:15px; padding:4px 0;">
                        <strong>Username:</strong> ${email}
                      </td>
                    </tr>

                    <tr>
                      <td style="font-size:15px; padding:4px 0;">
                        <strong>Password:</strong> ${password}
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

              <!-- CTA Button -->
              <tr>
                <td align="center" style="padding:30px 40px 10px 40px;">
                  <a href="${loginUrl}"
                    style="display:inline-block; background-color:#ff2f63; color:#ffffff;
                          text-decoration:none; padding:14px 36px; font-size:16px;
                          border-radius:6px; font-weight:600;">
                    Join the Team
                  </a>
                </td>
              </tr>

              <!-- Small Note -->
              <tr>
                <td align="center" style="padding:10px 40px 25px 40px;">
                  <p style="margin:0; font-size:12px; color:#999;">
                    This link will take you to the Hoopr login page
                  </p>
                </td>
              </tr>

              <!-- Help Section -->
              <tr>
                <td align="center" style="border-top:1px solid #eee; padding:25px 40px;">
                  <p style="margin:0; font-size:14px; color:#333; font-weight:600;">
                    Need Help?
                  </p>
                  <p style="margin:8px 0 0 0; font-size:13px; color:#777;">
                    If you're having trouble signing in or didn't request this account,
                    <a href="mailto:support@hoopr.ai" style="color:#ff2f63; text-decoration:none;">
                      contact support
                    </a>
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
    subject: "You've been invited to join your team on Hoopr",
    html,
  });
};

export const sendTrackDownloadNotificationEmail = async (
  recipientEmail: string,
  data: {
    trackName: string;
    trackCode: string;
    downloadedBy: string;
    creditsRemaining: number;
    licenseExpiryDate: string;
  },
): Promise<void> => {
  const {
    trackName,
    trackCode,
    downloadedBy,
    creditsRemaining,
    licenseExpiryDate,
  } = data;

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8" />
      <title>Track Downloaded</title>
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
                    New track downloaded
                  </h1>
                </td>
              </tr>

              <!-- Subtitle -->
              <tr>
                <td align="center" style="padding:10px 40px 20px 40px;">
                  <p style="margin:0; font-size:15px; color:#666; line-height:1.6;">
                    A track has been downloaded from your Hoopr Enterprise account.
                  </p>
                </td>
              </tr>

              <!-- Track Details Box -->
              <tr>
                <td style="padding:0 40px 16px 40px;">
                  <table width="100%" cellpadding="0" cellspacing="0"
                    style="background:#f7f7f7; border-radius:6px; padding:20px;">
                    <tr>
                      <td style="font-size:15px; padding:5px 0; color:#333;">
                        <strong>Track:</strong> ${trackName}
                      </td>
                    </tr>
                    <tr>
                      <td style="font-size:15px; padding:5px 0; color:#333;">
                        <strong>Downloaded by:</strong> ${downloadedBy}
                      </td>
                    </tr>
                    <tr>
                      <td style="font-size:15px; padding:5px 0; color:#333;">
                        <strong>Credits remaining:</strong> ${creditsRemaining}
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

              <!-- Reminder Box -->
              <tr>
                <td style="padding:0 40px 25px 40px;">
                  <table width="100%" cellpadding="0" cellspacing="0"
                    style="background:#fffbf0; border-left:4px solid #f59e0b; border-radius:0 6px 6px 0; padding:16px 20px;">
                    <tr>
                      <td style="font-size:14px; color:#555; line-height:1.7;">
                        🔗 &nbsp;Reminder: Please add the content link once the music is used to keep licenses compliant.
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

              <!-- CTA Button -->
              <tr>
                <td align="center" style="padding:10px 40px 10px 40px;">
                  <a href="https://enterprise.hoopr.ai/activity"
                    style="display:inline-block; background-color:#ff2f63; color:#ffffff;
                          text-decoration:none; padding:14px 36px; font-size:16px;
                          border-radius:6px; font-weight:600;">
                    View Activity
                  </a>
                </td>
              </tr>

              <!-- Spacer -->
              <tr><td style="height:20px;"></td></tr>

              <!-- Help Section -->
              <tr>
                <td align="center" style="border-top:1px solid #eee; padding:25px 40px;">
                  <p style="margin:0; font-size:14px; color:#333; font-weight:600;">
                    Need Help?
                  </p>
                  <p style="margin:8px 0 0 0; font-size:13px; color:#777;">
                    If you have any questions about licensing,
                    <a href="mailto:support@hoopr.ai" style="color:#ff2f63; text-decoration:none;">
                      contact support
                    </a>
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
    subject: `Track activity update on your Hoopr account`,
    html,
  });
};

export const sendTeamJoinNotificationEmail = async (
  recipientEmail: string,
  newMemberName: string,
  newMemberEmail: string,
): Promise<void> => {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8" />
      <title>New Team Member</title>
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
                    New team member added
                  </h1>
                </td>
              </tr>

              <!-- Subtitle -->
              <tr>
                <td align="center" style="padding:10px 40px 20px 40px;">
                  <p style="margin:0; font-size:15px; color:#666; line-height:1.6;">
                    <strong>${newMemberName}</strong> has successfully joined your Hoopr Enterprise account.<br/><br/>
                    They now have access based on the permissions set by the admin.<br/>
                    You can update or revoke access at any time from the dashboard.
                  </p>
                </td>
              </tr>

              <!-- Member Details Box -->
              <tr>
                <td style="padding:0 40px 25px 40px;">
                  <table width="100%" cellpadding="0" cellspacing="0"
                    style="background:#f7f7f7; border-radius:6px; padding:20px;">
                    <tr>
                      <td style="font-size:16px; font-weight:600; color:#333; padding-bottom:10px;">
                        New Member Details
                      </td>
                    </tr>

                    <tr>
                      <td style="font-size:15px; padding:4px 0;">
                        <strong>Name:</strong> ${newMemberName}
                      </td>
                    </tr>

                    <tr>
                      <td style="font-size:15px; padding:4px 0;">
                        <strong>Email:</strong> ${newMemberEmail}
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

              <!-- CTA Button -->
              <tr>
                <td align="center" style="padding:10px 40px 10px 40px;">
                  <a href="https://enterprise.hoopr.ai/team"
                    style="display:inline-block; background-color:#ff2f63; color:#ffffff;
                          text-decoration:none; padding:14px 36px; font-size:16px;
                          border-radius:6px; font-weight:600;">
                    View Team Access
                  </a>
                </td>
              </tr>

              <!-- Spacer -->
              <tr><td style="height:20px;"></td></tr>

              <!-- Help Section -->
              <tr>
                <td align="center" style="border-top:1px solid #eee; padding:25px 40px; margin-top:15px;">
                  <p style="margin:0; font-size:14px; color:#333; font-weight:600;">
                    Need Help?
                  </p>
                  <p style="margin:8px 0 0 0; font-size:13px; color:#777;">
                    If you have any questions,
                    <a href="mailto:support@hoopr.ai" style="color:#ff2f63; text-decoration:none;">
                      contact support
                    </a>
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
    subject: `${newMemberName} has joined your Hoopr team`,
    html,
  });
};

export const sendAdminCredentialsEmail = async (
  email: string,
  password: string,
  loginUrl: string,
): Promise<void> => {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8" />
      <title>Your Admin Account is Ready</title>
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
                    You're all set!
                  </h1>
                </td>
              </tr>

              <!-- Subtitle -->
              <tr>
                <td align="center" style="padding:10px 40px 20px 40px;">
                  <p style="margin:0; font-size:15px; color:#666; line-height:1.6;">
                    Your Hoopr Enterprise onboarding is now complete.<br/>
                    Your team can start accessing music under a single, centrally managed account with full visibility and control.
                  </p>
                </td>
              </tr>

              <!-- You can now box -->
              <tr>
                <td style="padding:0 40px 25px 40px;">
                  <table width="100%" cellpadding="0" cellspacing="0"
                    style="background:#fff8f9; border-left:4px solid #ff2f63; border-radius:0 6px 6px 0; padding:16px 20px;">
                    <tr>
                      <td style="font-size:14px; font-weight:600; color:#333; padding-bottom:10px;">
                        You can now:
                      </td>
                    </tr>
                    <tr>
                      <td style="font-size:14px; color:#555; line-height:2;">
                        • &nbsp;Invite team members<br/>
                        • &nbsp;Assign or update access<br/>
                        • &nbsp;Monitor usage and credits
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

              <!-- Credentials Box -->
              <tr>
                <td style="padding:0 40px;">
                  <table width="100%" cellpadding="0" cellspacing="0"
                    style="background:#f7f7f7; border-radius:6px; padding:20px;">
                    <tr>
                      <td style="font-size:16px; font-weight:600; color:#333; padding-bottom:10px;">
                        Admin Credentials
                      </td>
                    </tr>

                    <tr>
                      <td style="font-size:14px; color:#777; padding-bottom:15px;">
                        Keep these credentials safe and do not share them
                      </td>
                    </tr>

                    <tr>
                      <td style="font-size:15px; padding:4px 0;">
                        <strong>Email:</strong> ${email}
                      </td>
                    </tr>

                    <tr>
                      <td style="font-size:15px; padding:4px 0;">
                        <strong>Password:</strong> ${password}
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

              <!-- CTA Button -->
              <tr>
                <td align="center" style="padding:30px 40px 10px 40px;">
                  <a href="${loginUrl}"
                    style="display:inline-block; background-color:#ff2f63; color:#ffffff;
                          text-decoration:none; padding:14px 36px; font-size:16px;
                          border-radius:6px; font-weight:600;">
                    Login to Dashboard
                  </a>
                </td>
              </tr>

              <!-- Small Note -->
              <tr>
                <td align="center" style="padding:10px 40px 25px 40px;">
                  <p style="margin:0; font-size:12px; color:#999;">
                    We strongly recommend changing your password after your first login
                  </p>
                </td>
              </tr>

              <!-- Help Section -->
              <tr>
                <td align="center" style="border-top:1px solid #eee; padding:25px 40px;">
                  <p style="margin:0; font-size:14px; color:#333; font-weight:600;">
                    Need Help?
                  </p>
                  <p style="margin:8px 0 0 0; font-size:13px; color:#777;">
                    If you did not request this account or need assistance,
                    <a href="mailto:support@hoopr.ai" style="color:#ff2f63; text-decoration:none;">
                      contact support
                    </a>
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
    subject: "Your Hoopr Enterprise setup is complete",
    html,
  });
};

export const sendLowCreditsAlertEmail = async (
  recipientEmail: string,
  creditsRemaining: number,
): Promise<void> => {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8" />
      <title>Credits Running Low</title>
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
                    Low credit alert
                  </h1>
                </td>
              </tr>

              <!-- Subtitle -->
              <tr>
                <td align="center" style="padding:10px 40px 20px 40px;">
                  <p style="margin:0; font-size:15px; color:#666; line-height:1.6;">
                    Your Hoopr Enterprise account is running low on credits.
                  </p>
                </td>
              </tr>

              <!-- Credits Box -->
              <tr>
                <td style="padding:0 40px 16px 40px;">
                  <table width="100%" cellpadding="0" cellspacing="0"
                    style="background:#fff3f6; border-radius:6px; padding:20px; text-align:center;">
                    <tr>
                      <td>
                        <p style="margin:0; font-size:12px; color:#999; text-transform:uppercase; letter-spacing:0.5px;">Credits Remaining</p>
                        <p style="margin:8px 0 0 0; font-size:36px; font-weight:700; color:#ff2f63;">${creditsRemaining}</p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

              <!-- Warning Box -->
              <tr>
                <td style="padding:0 40px 25px 40px;">
                  <table width="100%" cellpadding="0" cellspacing="0"
                    style="background:#fffbf0; border-left:4px solid #f59e0b; border-radius:0 6px 6px 0; padding:16px 20px;">
                    <tr>
                      <td style="font-size:14px; color:#555; line-height:1.7;">
                        ⚠️ &nbsp;To avoid interruptions for your team, we recommend topping up or renewing your plan.
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

              <!-- CTA Button -->
              <tr>
                <td align="center" style="padding:10px 40px 10px 40px;">
                  <a href="https://enterprise.hoopr.ai/credits"
                    style="display:inline-block; background-color:#ff2f63; color:#ffffff;
                          text-decoration:none; padding:14px 36px; font-size:16px;
                          border-radius:6px; font-weight:600;">
                    Manage Credits
                  </a>
                </td>
              </tr>

              <!-- Spacer -->
              <tr><td style="height:20px;"></td></tr>

              <!-- Help Section -->
              <tr>
                <td align="center" style="border-top:1px solid #eee; padding:25px 40px;">
                  <p style="margin:0; font-size:14px; color:#333; font-weight:600;">
                    Need Help?
                  </p>
                  <p style="margin:8px 0 0 0; font-size:13px; color:#777;">
                    If you have any questions about your credits or plan,
                    <a href="mailto:support@hoopr.ai" style="color:#ff2f63; text-decoration:none;">
                      contact support
                    </a>
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
    subject: "Credits running low on your Hoopr account",
    html,
  });
};

export const sendFirstLoginWelcomeEmail = async (
  email: string,
  loginUrl: string,
  userName?: string,
): Promise<void> => {
  const displayName = userName || "there";
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8" />
      <title>Welcome to Hoopr</title>
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
                    You're all set!
                  </h1>
                </td>
              </tr>

              <!-- Subtitle -->
              <tr>
                <td align="center" style="padding:10px 40px 20px 40px;">
                  <p style="margin:0; font-size:15px; color:#666; line-height:1.6;">
                    Your Hoopr Enterprise onboarding is now complete.<br/>
                    Your team can start accessing music under a single, centrally managed account with full visibility and control.
                  </p>
                </td>
              </tr>

              <!-- You can now box -->
              <tr>
                <td style="padding:0 40px 25px 40px;">
                  <table width="100%" cellpadding="0" cellspacing="0"
                    style="background:#fff8f9; border-left:4px solid #ff2f63; border-radius:0 6px 6px 0; padding:16px 20px;">
                    <tr>
                      <td style="font-size:14px; font-weight:600; color:#333; padding-bottom:10px;">
                        You can now:
                      </td>
                    </tr>
                    <tr>
                      <td style="font-size:14px; color:#555; line-height:2;">
                        • &nbsp;Invite team members<br/>
                        • &nbsp;Assign or update access<br/>
                        • &nbsp;Monitor usage and credits
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

              <!-- CTA Button -->
              <tr>
                <td align="center" style="padding:10px 40px 10px 40px;">
                  <a href="${loginUrl}"
                    style="display:inline-block; background-color:#ff2f63; color:#ffffff;
                          text-decoration:none; padding:14px 36px; font-size:16px;
                          border-radius:6px; font-weight:600;">
                    Go to Dashboard
                  </a>
                </td>
              </tr>

              <!-- Small Note -->
              <tr>
                <td align="center" style="padding:10px 40px 25px 40px;">
                  <p style="margin:0; font-size:12px; color:#999;">
                    This link will take you to the Hoopr dashboard
                  </p>
                </td>
              </tr>

              <!-- Help Section -->
              <tr>
                <td align="center" style="border-top:1px solid #eee; padding:25px 40px;">
                  <p style="margin:0; font-size:14px; color:#333; font-weight:600;">
                    Need Help?
                  </p>
                  <p style="margin:8px 0 0 0; font-size:13px; color:#777;">
                    If you have any questions or need assistance,
                    <a href="mailto:support@hoopr.ai" style="color:#ff2f63; text-decoration:none;">
                      contact support
                    </a>
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
    subject: "Your Hoopr Enterprise setup is complete",
    html,
  });
};
