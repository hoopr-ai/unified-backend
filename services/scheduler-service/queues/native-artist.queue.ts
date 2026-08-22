import { Queue } from "bullmq";

const connection = {
  host: process.env.REDIS_HOST || "localhost",
  port: Number(process.env.REDIS_PORT) || 6379,
};

export const nativeArtistQueue = new Queue("native-artist", {
  connection,
  defaultJobOptions: {
    removeOnComplete: 30,
    removeOnFail: 30,
    // No retries. A failed run costs one day of freshness on a flag that only
    // changes when a new Originals release lands; retrying into a DB that is
    // already unhappy is worse than waiting for tomorrow.
    attempts: 1,
  },
});

/**
 * Once a day, at 03:00 IST — deep off-peak for an India-facing catalogue, and
 * well clear of the 6-hourly rail refresh at the top of the hour.
 *
 * BullMQ repeatable jobs are keyed in Redis, so a multi-instance deployment
 * still fires this exactly once; the same is not true of a bare setInterval,
 * which is why this goes through the queue like every other scheduled job here.
 */
export const scheduleNativeArtistRecompute = async (): Promise<void> => {
  const existingJobs = await nativeArtistQueue.getRepeatableJobs();
  for (const job of existingJobs) {
    await nativeArtistQueue.removeRepeatableByKey(job.key);
  }

  await nativeArtistQueue.add(
    "recompute-native-artists",
    // "promote" — the nightly pass looks only at artists that are NOT flagged
    // yet and can only turn the flag on. See artist.persistence.service.
    { mode: "promote" as const },
    {
      repeat: {
        pattern: "0 3 * * *",
        tz: "Asia/Kolkata",
      },
      jobId: "native-artist-scheduled",
    },
  );
};

/** Manual enqueue — the admin route runs inline instead, this is for ops. */
export const triggerNativeArtistRecompute = async (
  mode: "promote" | "full" = "full",
): Promise<void> => {
  await nativeArtistQueue.add(
    "manual-recompute",
    { mode },
    { jobId: `manual-native-artist-${mode}-${Date.now()}` },
  );
};
