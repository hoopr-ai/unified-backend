import { Worker, Job } from "bullmq";
import { executeEmailCampaignBatch } from "../jobs/email-campaign.job";
import type { ProcessBatchResult } from "../../dto-service/email-campaign/modules.export";
import { logger } from "../../helper-service/logger";

const connection = {
  host: process.env.REDIS_HOST || "localhost",
  port: Number(process.env.REDIS_PORT) || 6379,
};

// concurrency 1 — a batch already saturates the per-second SES budget, and the
// DB campaign lock makes any extra concurrency a no-op anyway.
export const emailCampaignWorker = new Worker<object, ProcessBatchResult>(
  "email-campaign",
  async (job: Job) => {
    try {
      return await executeEmailCampaignBatch();
    } catch (error) {
      logger.error(`[EmailCampaignWorker] Job ${job.id} failed:`, error);
      throw error;
    }
  },
  {
    connection,
    concurrency: 1,
    // A 500-email batch at 10/sec runs ~50s; give slow batches room before
    // BullMQ considers the job stalled.
    lockDuration: 5 * 60 * 1000,
  }
);

emailCampaignWorker.on("failed", (job, error) => {
  logger.error(`[EmailCampaignWorker] Job ${job?.id} failed:`, error);
});

emailCampaignWorker.on("error", (error) => {
  logger.error(`[EmailCampaignWorker] Worker error:`, error);
});
