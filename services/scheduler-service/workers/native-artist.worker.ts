import { Worker, Job } from "bullmq";
import {
  executeNativeArtistRecompute,
  type NativeArtistRecomputeMode,
} from "../../business-service/admin-artist/modules.export";
import type { NativeArtistRecomputeResult } from "../../persistence-service/artists/modules.export";
import { logger } from "../../helper-service/logger";

const connection = {
  host: process.env.REDIS_HOST || "localhost",
  port: Number(process.env.REDIS_PORT) || 6379,
};

export const nativeArtistWorker = new Worker<
  { mode?: NativeArtistRecomputeMode },
  NativeArtistRecomputeResult
>(
  "native-artist",
  async (job: Job<{ mode?: NativeArtistRecomputeMode }>) => {
    try {
      return await executeNativeArtistRecompute(job.data?.mode ?? "promote");
    } catch (error) {
      logger.error(`[NativeArtistWorker] Job ${job.id} failed:`, error);
      throw error;
    }
  },
  {
    connection,
    // One at a time — the job is a single UPDATE over shared catalogue tables,
    // and two of them racing would only fight for the same row locks.
    concurrency: 1,
  },
);

nativeArtistWorker.on("completed", (job, result) => {
  logger.info(`[NativeArtistWorker] Job ${job.id} completed`, {
    mode: result.mode,
    promoted: result.promoted,
    demoted: result.demoted,
    durationMs: result.durationMs,
  });
});

nativeArtistWorker.on("failed", (job, error) => {
  logger.error(`[NativeArtistWorker] Job ${job?.id} failed:`, error);
});

nativeArtistWorker.on("error", (error) => {
  logger.error(`[NativeArtistWorker] Worker error:`, error);
});
