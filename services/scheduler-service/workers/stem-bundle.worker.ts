import { Worker, Job } from "bullmq";
import {
  buildStemBundle,
  type StemBundleInput,
} from "../../helper-service/stem-bundle.helper";
import { logger } from "../../helper-service/logger";
import { STEM_BUNDLE_QUEUE } from "../queues/stem-bundle.queue";

const connection = {
  host: process.env.REDIS_HOST || "localhost",
  port: Number(process.env.REDIS_PORT) || 6379,
};

/**
 * Builds the "mix + stems" zip out of band so the HTTP request that asked for
 * it can answer 202 immediately instead of holding a connection open for the
 * length of a multi-hundred-megabyte download-zip-upload cycle.
 *
 * Concurrency is deliberately low: each job holds whole mp3s in memory, so
 * building many at once is the fastest way to push this process into an OOM.
 * It is not 1, though — with a single slot a second brand downloading a
 * different track waits out the first build and can hit the client's own
 * timeout. Raise STEM_BUNDLE_CONCURRENCY only alongside the container's memory
 * limit.
 */
const CONCURRENCY = Number(process.env.STEM_BUNDLE_CONCURRENCY) || 2;

export const stemBundleWorker = new Worker<StemBundleInput, void>(
  STEM_BUNDLE_QUEUE,
  async (job: Job<StemBundleInput>) => {
    // The result is not returned through BullMQ — it is the cached object in
    // GCS, which is what the polling request reads.
    await buildStemBundle(job.data);
  },
  {
    connection,
    concurrency: CONCURRENCY,
  },
);

stemBundleWorker.on("completed", (job) => {
  logger.info(
    `[StemBundleWorker] Built bundle for track ${job.data.trackId} (job ${job.id})`,
  );
});

stemBundleWorker.on("failed", (job, error) => {
  logger.error(
    `[StemBundleWorker] Bundle for track ${job?.data?.trackId} failed (job ${job?.id}):`,
    error,
  );
});
