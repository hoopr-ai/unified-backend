import { Queue } from "bullmq";

const connection = {
  host: process.env.REDIS_HOST || "localhost",
  port: Number(process.env.REDIS_PORT) || 6379,
};

export const trialJourneyQueue = new Queue("trial-journey", {
  connection,
  defaultJobOptions: {
    removeOnComplete: 100,
    removeOnFail: 50,
    // No retries: every slot is claimed before it is sent, so a retried tick
    // could only skip — and the next tick is 10 minutes away anyway.
    attempts: 1,
  },
});

// Every 10 minutes: decide and send what is due for every running trial, close
// Day 7 for trials that just ended, invite reminders, onboarding re-triggers.
export const scheduleTrialJourney = async (): Promise<void> => {
  const existingJobs = await trialJourneyQueue.getRepeatableJobs();
  for (const job of existingJobs) {
    await trialJourneyQueue.removeRepeatableByKey(job.key);
  }

  await trialJourneyQueue.add(
    "trial-journey-tick",
    {},
    {
      repeat: {
        pattern: "*/10 * * * *",
      },
      jobId: "trial-journey-scheduled",
    }
  );
};

// Manual "run now" from the internal console.
export const triggerTrialJourneyTick = async (): Promise<void> => {
  await trialJourneyQueue.add("manual-tick", {}, { jobId: `manual-${Date.now()}` });
};
