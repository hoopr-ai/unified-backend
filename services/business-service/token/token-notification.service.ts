import { isPushConfigured, sendPush } from "../../helper-service/push.service";
import { logger } from "../../helper-service/logger";
import {
  latestPushPermission,
  listBrandMembers,
} from "../../persistence-service/trial/modules.export";
import { frontendUrl } from "../trial/magic-link.service";

// Push to every member of a brand when paid credits land on its account — a
// first allocation or a refill (both are a new token_assigned row). Product
// copy says "credits", never "tokens". Fire-and-forget: the assign response
// never waits, and a push failure never fails the assign.
export const notifyCreditsAdded = (
  brandId: number,
  grant: { type: string; tokens: number; isUnlimited: boolean },
): void => {
  (async () => {
    if (!isPushConfigured()) return;
    const members = await listBrandMembers(brandId);
    const permissions = await Promise.all(members.map((m) => latestPushPermission(Number(m.id))));
    const userIds = members.filter((_, i) => permissions[i] !== false).map((m) => Number(m.id));
    if (!userIds.length) return;

    const body = grant.isUnlimited
      ? `Unlimited ${grant.type} credits are now on your account.`
      : `${grant.tokens} ${grant.type} credit${grant.tokens === 1 ? " is" : "s are"} ready to use.`;
    const res = await sendPush({
      userIds,
      title: "Credits added to your account",
      body,
      url: `${frontendUrl()}/home`,
      data: { kind: "credits_added", tokenType: grant.type },
    });
    logger.info("[Push] Credits-added push", { brandId, userIds, delivered: res.delivered, id: res.id });
  })().catch((err) =>
    logger.error("[Push] Credits-added push failed", { brandId, error: (err as Error).message }),
  );
};
