import { Queue } from "bullmq";

const connection = {
  host: process.env.REDIS_HOST || "localhost",
  port: Number(process.env.REDIS_PORT) || 6379,
};

export const urlMonitorQueue = new Queue("url-monitor", {
  connection,
  defaultJobOptions: {
    removeOnComplete: 100,
    removeOnFail: 50,
    // No retries for the sweep itself — a failed check is just DOWN, and the
    // next 5-minute tick re-checks everything anyway.
    attempts: 1,
  },
});

export const scheduleUrlMonitor = async (): Promise<void> => {
  const existingJobs = await urlMonitorQueue.getRepeatableJobs();
  for (const job of existingJobs) {
    await urlMonitorQueue.removeRepeatableByKey(job.key);
  }

  await urlMonitorQueue.add(
    "monitor-all-urls",
    {},
    {
      repeat: {
        pattern: "*/5 * * * *",
      },
      jobId: "url-monitor-scheduled",
    }
  );
};

// Manual "check now" — for a single URL (pass its id) or a full sweep.
export const triggerUrlCheck = async (urlId?: number): Promise<void> => {
  await urlMonitorQueue.add(
    "manual-check",
    { urlId },
    { jobId: `manual-${urlId ?? "all"}-${Date.now()}` }
  );
};
