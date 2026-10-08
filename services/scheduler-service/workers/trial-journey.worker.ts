import { Worker, Job } from "bullmq";
import {
  executeTrialJourneyTick,
  type TrialJourneyTickSummary,
} from "../../business-service/trial/trial-journey.service";
import { logger } from "../../helper-service/logger";

const connection = {
  host: process.env.REDIS_HOST || "localhost",
  port: Number(process.env.REDIS_PORT) || 6379,
};

export const trialJourneyWorker = new Worker<object, TrialJourneyTickSummary>(
  "trial-journey",
  async (job: Job) => {
    try {
      return await executeTrialJourneyTick();
    } catch (error) {
      logger.error(`[TrialJourneyWorker] Job ${job.id} failed:`, error);
      throw error;
    }
  },
  {
    connection,
    // One tick at a time: overlapping ticks could only race for the same
    // claims, and the claim makes the loser skip anyway.
    concurrency: 1,
  }
);

trialJourneyWorker.on("completed", (job, result) => {
  logger.info(`[TrialJourneyWorker] Job ${job.id} completed`, result);
});

trialJourneyWorker.on("failed", (job, error) => {
  logger.error(`[TrialJourneyWorker] Job ${job?.id} failed:`, error);
});

trialJourneyWorker.on("error", (error) => {
  logger.error(`[TrialJourneyWorker] Worker error:`, error);
});
