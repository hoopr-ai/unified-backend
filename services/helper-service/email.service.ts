import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  auth: {
    user: 'infra@gsharp.media',
    pass: 'tbdp wxgb pgty amjm',
  },
});

interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
}

export const sendEmail = async (options: SendEmailOptions): Promise<void> => {
  const mailOptions = {
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: options.to,
    subject: options.subject,
    html: options.html,
  };

  await transporter.sendMail(mailOptions);
};

export const sendWelcomeEmail = async (
  email: string,
  password: string,
  loginUrl: string
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
    subject: 'Welcome - Your Account Has Been Created',
    html,
  });
};

export const sendInviteEmail = async (
  email: string,
  password: string,
  loginUrl: string,
  inviterName?: string
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
                    Your Invite is Here!!
                  </h1>
                </td>
              </tr>

              <!-- Subtitle -->
              <tr>
                <td align="center" style="padding:10px 40px 25px 40px;">
                  <p style="margin:0; font-size:15px; color:#666; line-height:1.6;">
                    Welcome to Hoopr! Your account has been successfully created.
                    Use the credentials below to sign in and start accessing our complete
                    library of licensed music.
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
                    Start Now
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
    subject: 'You Have Been Invited - Your Account Credentials',
    html,
  });
};
