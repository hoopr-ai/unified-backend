import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";
import { config } from "dotenv";
import { AppError } from "./AppError";

config();

// Same SES account as hoopr-backend (limits: 50,000/day, 14/sec). Region and
// credentials come from env so the account can be rotated without a deploy.
//   AWS_SES_REGION            (defaults to ap-south-1, hoopr's region)
//   SES_AWS_ACCESS_KEY_ID / SES_AWS_SECRET_ACCESS_KEY
//                             dedicated SES credentials — preferred, so ambient
//                             AWS_* vars used by other tooling on the host can
//                             never hijack email sending
//   AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY (fallback; then the SDK default
//                             provider chain, e.g. instance role)
//   SES_SENDER_MAIL           verified sender identity
//   SES_CONFIGURATION_SET     optional — routes bounce/complaint events to SNS
import { logger } from "./logger";

const region = process.env.AWS_SES_REGION || "ap-south-1";

const accessKeyId =
  process.env.SES_AWS_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID;
const secretAccessKey =
  process.env.SES_AWS_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY;

const explicitCredentials =
  accessKeyId && secretAccessKey
    ? { accessKeyId, secretAccessKey }
    : undefined;

// One line at boot so a misconfigured host is diagnosable from the logs alone:
// which region, and WHICH key is signing (prefix only) — or the default chain.
logger.info(
  `[SES] region=${region} sender=${process.env.SES_SENDER_MAIL || "(unset)"} ` +
    (explicitCredentials
      ? `key=${explicitCredentials.accessKeyId.slice(0, 8)}… (${process.env.SES_AWS_ACCESS_KEY_ID ? "SES_AWS_*" : "AWS_*"} env)`
      : "credentials=default provider chain (no env keys found)")
);

const sesClient = new SESClient({
  region,
  ...(explicitCredentials ? { credentials: explicitCredentials } : {}),
});

export interface SendSesEmailOptions {
  to: string;
  subject: string;
  html: string;
  from?: string;
}

export interface SendSesEmailResult {
  messageId: string | null;
}

export const sendSesEmail = async (
  options: SendSesEmailOptions
): Promise<SendSesEmailResult> => {
  const sender = options.from || process.env.SES_SENDER_MAIL;
  if (!sender) {
    throw new AppError("SES_SENDER_MAIL is not configured", 500);
  }

  const command = new SendEmailCommand({
    Source: sender,
    Destination: { ToAddresses: [options.to] },
    Message: {
      Subject: { Data: options.subject, Charset: "UTF-8" },
      Body: { Html: { Data: options.html, Charset: "UTF-8" } },
    },
    ...(process.env.SES_CONFIGURATION_SET
      ? { ConfigurationSetName: process.env.SES_CONFIGURATION_SET }
      : {}),
  });

  const result = await sesClient.send(command);
  return { messageId: result.MessageId ?? null };
};
