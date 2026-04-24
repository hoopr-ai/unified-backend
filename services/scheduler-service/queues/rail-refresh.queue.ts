import { Queue } from "bullmq";

const connection = {
  host: process.env.REDIS_HOST || "localhost",
  port: Number(process.env.REDIS_PORT) || 6379,
};

export const railRefreshQueue = new Queue("rail-refresh", {
  connection,
  defaultJobOptions: {
    removeOnComplete: 100,
    removeOnFail: 50,
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 60000,
    },
  },
});

export const scheduleRailRefresh = async (): Promise<void> => {
  const existingJobs = await railRefreshQueue.getRepeatableJobs();
  for (const job of existingJobs) {
    await railRefreshQueue.removeRepeatableByKey(job.key);
  }

  await railRefreshQueue.add(
    "refresh-all-rails",
    {},
    {
      repeat: {
        pattern: "0 */6 * * *",
      },
      jobId: "rail-refresh-scheduled",
    }
  );
};

export const triggerManualRefresh = async (): Promise<void> => {
  await railRefreshQueue.add(
    "manual-refresh",
    {},
    { jobId: `manual-${Date.now()}` }
  );
};
