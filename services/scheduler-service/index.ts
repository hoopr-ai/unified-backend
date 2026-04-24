import {
  scheduleRailRefresh,
  railRefreshQueue,
  triggerManualRefresh,
} from "./queues/rail-refresh.queue";
import {
  brandRecommendQueue,
  triggerBrandRecommend,
} from "./queues/brand-recommend.queue";
import { railRefreshWorker } from "./workers/rail-refresh.worker";
import { brandRecommendWorker } from "./workers/brand-recommend.worker";
import { logger } from "../helper-service/logger";

export async function initializeScheduler(): Promise<void> {
  try {
    await scheduleRailRefresh();
    logger.info("[Scheduler] Rail refresh job scheduled (every 6 hours)");

    const repeatableJobs = await railRefreshQueue.getRepeatableJobs();
    logger.info(`[Scheduler] Active repeatable jobs: ${repeatableJobs.length}`);

    const gracefulShutdown = async () => {
      logger.info("[Scheduler] Shutting down...");
      await railRefreshWorker.close();
      await brandRecommendWorker.close();
      await railRefreshQueue.close();
      await brandRecommendQueue.close();
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
export { brandRecommendQueue, brandRecommendWorker, triggerBrandRecommend };
export { executeRailRefresh } from "./jobs/rail-refresh.job";
export { executeBrandRecommend } from "./jobs/brand-recommend.job";
