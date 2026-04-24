import { Worker, Job } from "bullmq";
import { executeRailRefresh, RefreshSummary } from "../jobs/rail-refresh.job";
import { logger } from "../../helper-service/logger";

const connection = {
  host: process.env.REDIS_HOST || "localhost",
  port: Number(process.env.REDIS_PORT) || 6379,
};

export const railRefreshWorker = new Worker<object, RefreshSummary>(
  "rail-refresh",
  async (job: Job) => {
    logger.info(`[RailRefreshWorker] Processing job ${job.id}`);

    try {
      const summary = await executeRailRefresh();
      return summary;
    } catch (error) {
      logger.error(`[RailRefreshWorker] Job ${job.id} failed:`, error);
      throw error;
    }
  },
  {
    connection,
    concurrency: 1,
  }
);

railRefreshWorker.on("completed", (job, result) => {
  logger.info(`[RailRefreshWorker] Job ${job.id} completed`, {
    totalRails: result.totalRails,
    successful: result.successful,
    failed: result.failed,
  });
});

railRefreshWorker.on("failed", (job, error) => {
  logger.error(`[RailRefreshWorker] Job ${job?.id} failed:`, error);
});

railRefreshWorker.on("error", (error) => {
  logger.error(`[RailRefreshWorker] Worker error:`, error);
});
