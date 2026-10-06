import { isPushConfigured, sendPush } from "../../helper-service/push.service";
import { sendEmail } from "../../helper-service/email.service";
import { logger } from "../../helper-service/logger";
import {
  latestPushPermission,
  listBrandMembers,
} from "../../persistence-service/trial/modules.export";
import { isEmailSuppressed } from "../../persistence-service/email-campaign/email-campaign.persistence.service";
import { frontendUrl } from "../trial/magic-link.service";
import { paidCreditsCopy, paidCreditsEmailHtml } from "../trial/trial-journey.templates";

// Push + email to every member of a brand when paid credits land on its
// account — a first allocation or a refill (both are a new token_assigned
// row). Same copy on both channels; product copy says "credits", never
// "tokens". Fire-and-forget: the assign response never waits, and a failed
// notification never fails the assign.
export const notifyCreditsAdded = (
  brandId: number,
  grant: { type: string; tokens: number; isUnlimited: boolean },
): void => {
  (async () => {
    const members = await listBrandMembers(brandId);
    if (!members.length) return;
    const copy = paidCreditsCopy(grant);

    if (isPushConfigured()) {
      const permissions = await Promise.all(members.map((m) => latestPushPermission(Number(m.id))));
      const userIds = members.filter((_, i) => permissions[i] !== false).map((m) => Number(m.id));
      if (userIds.length) {
        const res = await sendPush({
          userIds,
          title: copy.title,
          body: copy.body,
          url: `${frontendUrl()}${copy.path}`,
          data: { kind: "credits_added", tokenType: grant.type },
        });
        logger.info("[CreditsAdded] Push", { brandId, userIds, delivered: res.delivered, id: res.id });
      }
    }

    for (const m of members) {
      if (!m.email || (await isEmailSuppressed(m.email.toLowerCase()))) continue;
      try {
        await sendEmail({ to: m.email, subject: copy.title, html: paidCreditsEmailHtml(copy, m.firstName ?? null) });
      } catch (err) {
        logger.error("[CreditsAdded] Email failed", { brandId, userId: m.id, error: (err as Error).message });
      }
    }
  })().catch((err) =>
    logger.error("[CreditsAdded] Notification failed", { brandId, error: (err as Error).message }),
  );
};
