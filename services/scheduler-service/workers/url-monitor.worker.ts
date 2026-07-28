import { Worker, Job } from "bullmq";
import {
  executeUrlMonitor,
  type MonitorRunSummary,
} from "../../business-service/url-monitor/modules.export";
import { logger } from "../../helper-service/logger";

const connection = {
  host: process.env.REDIS_HOST || "localhost",
  port: Number(process.env.REDIS_PORT) || 6379,
};

export const urlMonitorWorker = new Worker<{ urlId?: number }, MonitorRunSummary>(
  "url-monitor",
  async (job: Job<{ urlId?: number }>) => {
    try {
      return await executeUrlMonitor(job.data?.urlId);
    } catch (error) {
      logger.error(`[UrlMonitorWorker] Job ${job.id} failed:`, error);
      throw error;
    }
  },
  {
    connection,
    concurrency: 1,
  }
);

urlMonitorWorker.on("completed", (job, result) => {
  logger.info(`[UrlMonitorWorker] Job ${job.id} completed`, {
    total: result.total,
    up: result.up,
    down: result.down,
    alertsSent: result.alertsSent,
  });
});

urlMonitorWorker.on("failed", (job, error) => {
  logger.error(`[UrlMonitorWorker] Job ${job?.id} failed:`, error);
});

urlMonitorWorker.on("error", (error) => {
  logger.error(`[UrlMonitorWorker] Worker error:`, error);
});
