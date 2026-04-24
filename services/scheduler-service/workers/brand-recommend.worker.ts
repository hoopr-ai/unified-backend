import { Worker, Job } from "bullmq";
import { executeBrandRecommend, BrandRecommendSummary } from "../jobs/brand-recommend.job";
import { BrandRecommendJobData } from "../queues/brand-recommend.queue";
import { logger } from "../../helper-service/logger";

const connection = {
  host: process.env.REDIS_HOST || "localhost",
  port: Number(process.env.REDIS_PORT) || 6379,
};

export const brandRecommendWorker = new Worker<BrandRecommendJobData, BrandRecommendSummary>(
  "brand-recommend",
  async (job: Job<BrandRecommendJobData>) => {
    logger.info(`[BrandRecommendWorker] Processing job ${job.id}`, job.data);

    try {
      const summary = await executeBrandRecommend(job.data);
      return summary;
    } catch (error) {
      logger.error(`[BrandRecommendWorker] Job ${job.id} failed:`, error);
      throw error;
    }
  },
  {
    connection,
    concurrency: 1, // Process one job at a time to avoid overloading
  }
);

brandRecommendWorker.on("completed", (job, result) => {
  logger.info(`[BrandRecommendWorker] Job ${job.id} completed`, {
    totalBrands: result.totalBrands,
    successful: result.successful,
    failed: result.failed,
  });
});

brandRecommendWorker.on("failed", (job, error) => {
  logger.error(`[BrandRecommendWorker] Job ${job?.id} failed:`, error);
});

brandRecommendWorker.on("error", (error) => {
  logger.error(`[BrandRecommendWorker] Worker error:`, error);
});
