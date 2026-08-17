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
import {
  urlMonitorQueue,
  scheduleUrlMonitor,
  triggerUrlCheck,
} from "./queues/url-monitor.queue";
import {
  nativeArtistQueue,
  scheduleNativeArtistRecompute,
  triggerNativeArtistRecompute,
} from "./queues/native-artist.queue";
import { railRefreshWorker } from "./workers/rail-refresh.worker";
import { brandRecommendWorker } from "./workers/brand-recommend.worker";
import { emailCampaignWorker } from "./workers/email-campaign.worker";
import { urlMonitorWorker } from "./workers/url-monitor.worker";
import { nativeArtistWorker } from "./workers/native-artist.worker";
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

    await scheduleUrlMonitor();
    logger.info("[Scheduler] URL monitor job scheduled (every 5 minutes)");

    await scheduleNativeArtistRecompute();
    logger.info(
      "[Scheduler] Native artist flag recompute scheduled (daily 03:00 IST, promote-only)",
    );

    const repeatableJobs = await railRefreshQueue.getRepeatableJobs();
    logger.info(`[Scheduler] Active repeatable jobs: ${repeatableJobs.length}`);

    const gracefulShutdown = async () => {
      logger.info("[Scheduler] Shutting down...");
      await railRefreshWorker.close();
      await brandRecommendWorker.close();
      await emailCampaignWorker.close();
      await urlMonitorWorker.close();
      await nativeArtistWorker.close();
      await railRefreshQueue.close();
      await brandRecommendQueue.close();
      await emailCampaignQueue.close();
      await urlMonitorQueue.close();
      await nativeArtistQueue.close();
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
export { urlMonitorQueue, urlMonitorWorker, triggerUrlCheck };
export { nativeArtistQueue, nativeArtistWorker, triggerNativeArtistRecompute };
export { executeRailRefresh } from "./jobs/rail-refresh.job";
export { executeBrandRecommend } from "./jobs/brand-recommend.job";
