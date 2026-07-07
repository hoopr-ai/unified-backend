import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";
import { config } from "dotenv";
import { AppError } from "./AppError";

config();

// Same SES account as hoopr-backend (limits: 50,000/day, 14/sec). Region and
// credentials come from env so the account can be rotated without a deploy.
//   AWS_SES_REGION            (defaults to ap-south-1, hoopr's region)
//   AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY (falls back to the default
//                              provider chain when unset, e.g. instance role)
//   SES_SENDER_MAIL           verified sender identity
//   SES_CONFIGURATION_SET     optional — routes bounce/complaint events to SNS
const region = process.env.AWS_SES_REGION || "ap-south-1";

const explicitCredentials =
  process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
    ? {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      }
    : undefined;

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
