import {
  scheduleRailRefresh,
  railRefreshQueue,
  triggerManualRefresh,
} from "./queues/rail-refresh.queue";
import {
  brandRecommendQueue,
  triggerBrandRecommend,
} from "./queues/brand-recommend.queue";
import {
  emailCampaignQueue,
  scheduleEmailCampaignTicks,
  triggerEmailCampaignTick,
} from "./queues/email-campaign.queue";
import { railRefreshWorker } from "./workers/rail-refresh.worker";
import { brandRecommendWorker } from "./workers/brand-recommend.worker";
import { emailCampaignWorker } from "./workers/email-campaign.worker";
import { logger } from "../helper-service/logger";

export async function initializeScheduler(): Promise<void> {
  // Local-dev escape hatch. The scheduler awaits BullMQ ops that block forever when Redis is
  // unreachable, which prevents app.listen() from being called. Setting SKIP_SCHEDULER=true in
  // .env lets the HTTP server boot without Redis. Unset in every deployed env — behavior unchanged.
  if (process.env.SKIP_SCHEDULER === "true") {
    logger.info("[Scheduler] SKIP_SCHEDULER=true — scheduler not initialized.");
    return;
  }
  try {
    await scheduleRailRefresh();
    logger.info("[Scheduler] Rail refresh job scheduled (every 6 hours)");

    await scheduleEmailCampaignTicks();
    logger.info("[Scheduler] Email campaign tick scheduled (every minute)");

    const repeatableJobs = await railRefreshQueue.getRepeatableJobs();
    logger.info(`[Scheduler] Active repeatable jobs: ${repeatableJobs.length}`);

    const gracefulShutdown = async () => {
      logger.info("[Scheduler] Shutting down...");
      await railRefreshWorker.close();
      await brandRecommendWorker.close();
      await emailCampaignWorker.close();
      await railRefreshQueue.close();
      await brandRecommendQueue.close();
      await emailCampaignQueue.close();
      logger.info("[Scheduler] Shutdown complete");
    };

    process.on("SIGTERM", gracefulShutdown);
    process.on("SIGINT", gracefulShutdown);
  } catch (error) {
    logger.error("[Scheduler] Failed to initialize:", error);
    throw error;
  }
}

export { railRefreshQueue, railRefreshWorker, triggerManualRefresh };
export { emailCampaignQueue, emailCampaignWorker, triggerEmailCampaignTick };
export { brandRecommendQueue, brandRecommendWorker, triggerBrandRecommend };
export { executeRailRefresh } from "./jobs/rail-refresh.job";
export { executeBrandRecommend } from "./jobs/brand-recommend.job";
