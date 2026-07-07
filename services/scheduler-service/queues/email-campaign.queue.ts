import { Queue } from "bullmq";

const connection = {
  host: process.env.REDIS_HOST || "localhost",
  port: Number(process.env.REDIS_PORT) || 6379,
};

// One tick = one throttled batch of processCampaignBatch. Batches are
// idempotent and DB-lock protected, so overlapping/duplicate ticks are safe.
// No retries: the next minute's tick resumes exactly where this one stopped.
export const emailCampaignQueue = new Queue("email-campaign", {
  connection,
  defaultJobOptions: {
    removeOnComplete: 100,
    removeOnFail: 50,
    attempts: 1,
  },
});

export const scheduleEmailCampaignTicks = async (): Promise<void> => {
  const existingJobs = await emailCampaignQueue.getRepeatableJobs();
  for (const job of existingJobs) {
    await emailCampaignQueue.removeRepeatableByKey(job.key);
  }

  await emailCampaignQueue.add(
    "campaign-tick",
    {},
    {
      repeat: { pattern: "* * * * *" }, // every minute
      jobId: "email-campaign-tick",
    }
  );
};

// Fired right after an admin starts/resumes a campaign so the first batch
// goes out immediately instead of waiting for the next minute tick.
export const triggerEmailCampaignTick = async (): Promise<void> => {
  await emailCampaignQueue.add(
    "manual-tick",
    {},
    { jobId: `manual-${Date.now()}` }
  );
};
