import { sendEmail } from "../../helper-service/email.service";

// All email templates in this file are INTERNAL-only. They use the dark-green / mint visual
// language of the internal CMS (same palette as the Login.tsx left panel) so an internal
// employee can immediately tell an authentic Hoopr-internal email from a SMASH one. The
// SMASH-branded helpers in services/helper-service/email.service.ts are NOT used by any
// INTERNAL flow — including login OTP, welcome on create, password resets initiated from
// the internal CMS.

const INTERNAL_BRAND = {
  // Mirrors the Login.tsx left-panel gradient.
  headerGradient:
    "linear-gradient(135deg, #003527 0%, #064e3b 60%, #0a6b4f 100%)",
  primary: "#003527",
  primarySoft: "#22443d",
  mint: "#6ffbbe",
  mintSoft: "#b0f0d6",
  bodyText: "#191c1e",
  mutedText: "#475569",
  faintText: "#94a3b8",
  cardBg: "#ffffff",
  pageBg: "#f7f9fb",
  border: "#E2E8F0",
};

// Inline SVG wordmark so the email never has a hot-link dependency on a SMASH-domain image.
// Two interlocking rings (matches the HooprRings component in Login.tsx) + the "internal"
// wordmark, all rendered in light tones against the dark header.
const INTERNAL_WORDMARK_SVG = `
  <svg viewBox="0 0 220 36" xmlns="http://www.w3.org/2000/svg" width="170" height="28">
    <defs>
      <linearGradient id="lr-g1" x1="0" y1="0" x2="36" y2="36" gradientUnits="userSpaceOnUse">
        <stop stop-color="#FF7479" />
        <stop offset="1" stop-color="#FF3A68" />
      </linearGradient>
      <linearGradient id="lr-g2" x1="20" y1="0" x2="56" y2="36" gradientUnits="userSpaceOnUse">
        <stop stop-color="#FF7579" />
        <stop offset="0.5" stop-color="#FF536F" />
        <stop offset="1" stop-color="#FF3768" />
      </linearGradient>
    </defs>
    <circle cx="38" cy="18" r="14" stroke="url(#lr-g2)" stroke-width="5" fill="none" />
    <circle cx="20" cy="18" r="14" stroke="url(#lr-g1)" stroke-width="5" fill="none" />
    <text x="64" y="24" fill="#ffffff" font-family="'Manrope', 'Inter', system-ui, sans-serif"
      font-size="18" font-weight="700" letter-spacing="-0.4px">hoopr</text>
    <text x="124" y="24" fill="${INTERNAL_BRAND.mintSoft}" font-family="'Manrope', 'Inter', system-ui, sans-serif"
      font-size="18" font-weight="500" letter-spacing="-0.4px">internal</text>
  </svg>
`;

// Shared shell so both templates use the same header / footer / typography.
// `bodyHtml` is inserted as the white card content.
const internalEmailShell = (params: {
  preheader: string; // hidden preheader for inbox previews
  bodyHtml: string;
}): string => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
</head>
<body style="margin:0; padding:0; background-color:${INTERNAL_BRAND.pageBg}; font-family: 'Manrope', 'Inter', -apple-system, system-ui, sans-serif; color:${INTERNAL_BRAND.bodyText};">
  <span style="display:none !important; opacity:0; visibility:hidden; height:0; width:0; overflow:hidden;">
    ${params.preheader}
  </span>
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:${INTERNAL_BRAND.pageBg}; padding:32px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0"
        style="background:${INTERNAL_BRAND.cardBg}; border-radius:12px; overflow:hidden;
               border:1px solid ${INTERNAL_BRAND.border};
               box-shadow:0 1px 2px rgba(15,23,42,0.04), 0 12px 32px -12px rgba(15,23,42,0.18);">
        <tr><td style="background: ${INTERNAL_BRAND.headerGradient}; padding:28px 32px;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td align="left" valign="middle">${INTERNAL_WORDMARK_SVG}</td>
              <td align="right" valign="middle"
                style="font-size:10.5px; font-weight:600; text-transform:uppercase; letter-spacing:0.16em; color:${INTERNAL_BRAND.mintSoft};">
                Operations Console
              </td>
            </tr>
          </table>
        </td></tr>
        <tr><td style="padding:32px 40px 8px 40px;">
          ${params.bodyHtml}
        </td></tr>
        <tr><td style="padding:0 40px 28px 40px; border-top:1px solid ${INTERNAL_BRAND.border}; margin-top:24px;">
          <p style="margin:18px 0 0 0; font-size:12px; color:${INTERNAL_BRAND.faintText}; line-height:1.6;">
            This message is for the addressee only. Hoopr Internal · automated, please do not reply.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>
`;

// ---------------------------------------------------------------------------
// WELCOME (sent when an admin creates a new INTERNAL employee)
// ---------------------------------------------------------------------------

interface InternalUserWelcomeEmailParams {
  firstName: string;
  email: string;
  loginUrl: string;
}

export const sendInternalUserWelcomeEmail = async (
  params: InternalUserWelcomeEmailParams
): Promise<boolean> => {
  const body = `
    <h1 style="margin:0 0 8px 0; font-size:24px; font-weight:700; letter-spacing:-0.015em; color:${INTERNAL_BRAND.primary};">
      Welcome to the Hoopr Internal Console
    </h1>
    <p style="margin:0 0 18px 0; font-size:14px; color:${INTERNAL_BRAND.mutedText}; line-height:1.7;">
      Hi ${params.firstName}, an admin has set up your account on the Hoopr internal operations console. Sign-in is passwordless — open the console, enter your email, and we'll send you a one-time code.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0"
      style="background:${INTERNAL_BRAND.pageBg}; border:1px solid ${INTERNAL_BRAND.border}; border-radius:10px; padding:18px 20px; margin:8px 0 22px 0;">
      <tr><td style="font-size:11px; font-weight:600; letter-spacing:0.08em; text-transform:uppercase; color:${INTERNAL_BRAND.mutedText}; padding-bottom:6px;">
        Console URL
      </td></tr>
      <tr><td style="font-size:14px; color:${INTERNAL_BRAND.bodyText};">
        <a href="${params.loginUrl}" style="color:${INTERNAL_BRAND.primarySoft}; text-decoration:none;">${params.loginUrl}</a>
      </td></tr>
      <tr><td style="font-size:11px; font-weight:600; letter-spacing:0.08em; text-transform:uppercase; color:${INTERNAL_BRAND.mutedText}; padding:14px 0 6px 0;">
        Sign-in email
      </td></tr>
      <tr><td style="font-size:14px; color:${INTERNAL_BRAND.bodyText};">
        ${params.email}
      </td></tr>
    </table>
    <table cellpadding="0" cellspacing="0" style="margin:0 0 18px 0;">
      <tr><td>
        <a href="${params.loginUrl}"
          style="display:inline-block; padding:13px 30px; font-size:13px; font-weight:600;
                 letter-spacing:0.16em; text-transform:uppercase; text-decoration:none;
                 color:#ffffff; background:${INTERNAL_BRAND.headerGradient};
                 border-radius:8px;
                 box-shadow:0 4px 18px rgba(34,68,61,0.28), inset 0 1px 0 rgba(255,255,255,0.08);">
          Open the console
        </a>
      </td></tr>
    </table>
    <p style="margin:0 0 6px 0; font-size:13px; color:${INTERNAL_BRAND.mutedText}; line-height:1.7;">
      Prefer a password? You can set one yourself from the profile screen after first sign-in. No admin action needed.
    </p>
  `;
  try {
    await sendEmail({
      to: params.email,
      subject: "Your Hoopr internal account is ready",
      html: internalEmailShell({
        preheader: "Your Hoopr internal console account is ready — sign in with a one-time code.",
        bodyHtml: body,
      }),
    });
    return true;
  } catch {
    return false;
  }
};

// ---------------------------------------------------------------------------
// LOGIN OTP (sent when an INTERNAL user requests a sign-in code)
// ---------------------------------------------------------------------------
//
// Distinct from the SMASH-branded sendOtpEmail() in helper-service/email.service.ts.
// That one ships the Hoopr Smash logo + magenta accents and is used for SMASH /
// ENTERPRISE password-reset OTPs. This one is INTERNAL-only.

export const sendInternalLoginOtpEmail = async (
  email: string,
  otp: string
): Promise<void> => {
  const body = `
    <h1 style="margin:0 0 8px 0; font-size:24px; font-weight:700; letter-spacing:-0.015em; color:${INTERNAL_BRAND.primary};">
      Your sign-in code
    </h1>
    <p style="margin:0 0 22px 0; font-size:14px; color:${INTERNAL_BRAND.mutedText}; line-height:1.7;">
      Use the code below to sign in to the Hoopr internal console. The code expires in 5 minutes.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 22px 0;">
      <tr><td align="center"
        style="background:${INTERNAL_BRAND.pageBg};
               border:2px solid ${INTERNAL_BRAND.primary};
               border-radius:12px; padding:26px 20px;">
        <p style="margin:0; font-size:38px; font-weight:700; letter-spacing:12px;
                  color:${INTERNAL_BRAND.primary};
                  font-family:'JetBrains Mono','Courier New',Courier,monospace;">
          ${otp}
        </p>
        <p style="margin:8px 0 0 0; font-size:11px; font-weight:600; letter-spacing:0.16em;
                  text-transform:uppercase; color:${INTERNAL_BRAND.mutedText};">
          One-time code · expires in 5 min
        </p>
      </td></tr>
    </table>
    <p style="margin:0 0 6px 0; font-size:13px; color:${INTERNAL_BRAND.mutedText}; line-height:1.7;">
      If you didn't request this code, ignore this email — your account stays locked.
    </p>
    <p style="margin:0; font-size:13px; color:${INTERNAL_BRAND.mutedText}; line-height:1.7;">
      Never share this code with anyone, including Hoopr staff.
    </p>
  `;
  // This one throws on send failure — the caller (internal-login-otp.service) maps it to
  // a 502 so the user sees "Failed to send OTP. Please retry." rather than a silent 200.
  await sendEmail({
    to: email,
    subject:
      (process.env.NODE_ENV !== "production" ? "DEV: " : "") +
      "Your Hoopr internal sign-in code",
    html: internalEmailShell({
      preheader: `Your Hoopr internal sign-in code: ${otp} (expires in 5 minutes).`,
      bodyHtml: body,
    }),
  });
};
