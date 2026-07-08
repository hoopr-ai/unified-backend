import axios from "axios";
import MessageValidator from "sns-validator";
import { logger } from "../../helper-service/logger";
import { AppError } from "../../helper-service/AppError";
import {
  createEmailEvent,
  upsertSuppression,
  findRecipientByMessageId,
} from "../../persistence-service/email-campaign/modules.export";
import {
  EmailEventType,
  EmailSuppressionReason,
} from "../../dto-service/email-campaign/modules.export";

// Handles the SNS topic that the SES configuration set publishes
// bounce/complaint notifications to.
//
// One-time AWS setup (same account as hoopr-backend):
//   1. SES console → Configuration sets → create one (name goes in
//      SES_CONFIGURATION_SET) with an SNS event destination for
//      "Bounce" and "Complaint" events.
//   2. Subscribe this endpoint (POST /webhooks/ses) to that SNS topic over
//      HTTPS. SNS sends a SubscriptionConfirmation which this handler
//      auto-confirms.
// Optionally set SES_SNS_TOPIC_ARN to reject messages from any other topic.

const validator = new MessageValidator();

// Verifies the SNS message signature against the AWS signing cert.
const validateSnsMessage = (
  message: Record<string, unknown>
): Promise<Record<string, unknown>> =>
  new Promise((resolve, reject) => {
    validator.validate(message, (err, validated) => {
      if (err || !validated) reject(err ?? new Error("SNS validation failed"));
      else resolve(validated);
    });
  });

interface SesNotification {
  notificationType?: string;
  eventType?: string;
  mail?: { messageId?: string; destination?: string[] };
  bounce?: {
    bounceType?: string;
    bounceSubType?: string;
    bouncedRecipients?: { emailAddress?: string; diagnosticCode?: string }[];
  };
  complaint?: {
    complaintFeedbackType?: string;
    complainedRecipients?: { emailAddress?: string }[];
  };
}

const recordEvent = async (
  type: EmailEventType,
  email: string,
  messageId: string | null,
  detail: string | null,
  payload: object
) => {
  const normalized = email.trim().toLowerCase();
  // Tie the event back to a campaign when the messageId matches a campaign
  // send; transactional mail on the same topic just gets campaignId null.
  const recipient = messageId ? await findRecipientByMessageId(messageId) : null;
  await createEmailEvent({
    type,
    email: normalized,
    messageId,
    campaignId: recipient?.campaignId ?? null,
    detail,
    payload,
  });
  return normalized;
};

const handleSesNotification = async (notification: SesNotification) => {
  const kind = (notification.notificationType || notification.eventType || "").toLowerCase();
  const messageId = notification.mail?.messageId ?? null;

  if (kind === "bounce" && notification.bounce) {
    const { bounceType, bounceSubType, bouncedRecipients = [] } = notification.bounce;
    for (const r of bouncedRecipients) {
      if (!r.emailAddress) continue;
      const detail = [bounceType, bounceSubType, r.diagnosticCode]
        .filter(Boolean)
        .join(" / ");
      const email = await recordEvent(
        EmailEventType.BOUNCE,
        r.emailAddress,
        messageId,
        detail,
        notification as object
      );
      // Only permanent bounces poison an address; transient ones (mailbox
      // full, greylisting) are recorded but stay sendable.
      if (bounceType === "Permanent") {
        await upsertSuppression({
          email,
          reason: EmailSuppressionReason.BOUNCE,
          detail,
          messageId,
        });
      }
    }
    return;
  }

  if (kind === "complaint" && notification.complaint) {
    const { complaintFeedbackType, complainedRecipients = [] } = notification.complaint;
    for (const r of complainedRecipients) {
      if (!r.emailAddress) continue;
      const email = await recordEvent(
        EmailEventType.COMPLAINT,
        r.emailAddress,
        messageId,
        complaintFeedbackType ?? null,
        notification as object
      );
      // Complaints always suppress — continuing to mail a complainer is the
      // fastest way to lose SES account standing.
      await upsertSuppression({
        email,
        reason: EmailSuppressionReason.COMPLAINT,
        detail: complaintFeedbackType ?? null,
        messageId,
      });
    }
    return;
  }

  logger.info(`[SesEvents] Ignoring notification of type '${kind}'`);
};

export const handleSnsMessageService = async (rawBody: string): Promise<void> => {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    throw new AppError("Invalid SNS payload", 400);
  }

  let message: Record<string, unknown>;
  try {
    message = await validateSnsMessage(parsed);
  } catch (err) {
    logger.error("[SesEvents] SNS signature validation failed:", err);
    throw new AppError("SNS signature validation failed", 403);
  }

  const expectedTopic = process.env.SES_SNS_TOPIC_ARN;
  if (expectedTopic && message.TopicArn !== expectedTopic) {
    throw new AppError("Unexpected SNS topic", 403);
  }

  const type = message.Type as string;

  if (type === "SubscriptionConfirmation" && typeof message.SubscribeURL === "string") {
    await axios.get(message.SubscribeURL);
    logger.info("[SesEvents] SNS subscription confirmed");
    return;
  }

  if (type === "Notification" && typeof message.Message === "string") {
    let notification: SesNotification;
    try {
      notification = JSON.parse(message.Message);
    } catch {
      logger.error("[SesEvents] Non-JSON SES notification body — ignored");
      return;
    }
    await handleSesNotification(notification);
  }
};
