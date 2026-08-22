import { Queue } from "bullmq";
import type { StemBundleInput } from "../../helper-service/stem-bundle.helper";

const connection = {
  host: process.env.REDIS_HOST || "localhost",
  port: Number(process.env.REDIS_PORT) || 6379,
};

export const STEM_BUNDLE_QUEUE = "stem-bundle";

let queue: Queue<StemBundleInput> | null = null;

/**
 * The bundle queue, created on first use.
 *
 * Lazy on purpose, unlike the scheduled queues: this one is reached from the
 * licence download request path, which every process loads. Constructing it at
 * import time would open a Redis connection in processes that never build a
 * bundle — including local runs with SKIP_SCHEDULER=true, where there is no
 * Redis to connect to.
 */
export const getStemBundleQueue = (): Queue<StemBundleInput> => {
  if (!queue) {
    queue = new Queue<StemBundleInput>(STEM_BUNDLE_QUEUE, {
      connection,
      defaultJobOptions: {
        removeOnComplete: 50,
        // Failures are RETAINED (rather than removeOnFail: true) so the
        // download endpoint can inspect a failed job and turn a broken build
        // into an error for the caller instead of polling "preparing" forever.
        // It removes the job once it has reported it, which is what lets the
        // next request try again. Bounded so unobserved failures — a build
        // nobody ever retried — cannot grow without limit.
        removeOnFail: 200,
        // A bundle fails because an object is missing from the bucket, which
        // retrying cannot fix — and the caller is sitting in a poll loop.
        attempts: 1,
      },
    });
  }
  return queue;
};

/** Closes the queue if it was ever opened. Used by the scheduler's shutdown. */
export const closeStemBundleQueue = async (): Promise<void> => {
  if (queue) {
    await queue.close();
    queue = null;
  }
};

/** One job per track, so concurrent downloaders of the same track share a build. */
export const stemBundleJobId = (trackId: string): string => `bundle-${trackId}`;
