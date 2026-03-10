import { config } from "dotenv";

config();

export const REDIS_HOST = process.env.REDIS_HOST || "localhost";
export const REDIS_PORT = Number(process.env.REDIS_PORT) || 6379;

// BullMQ connection options - requires maxRetriesPerRequest: null
export const bullmqConnection = {
  host: REDIS_HOST,
  port: REDIS_PORT,
  maxRetriesPerRequest: null,
};

// Worker concurrency - how many jobs each worker processes in parallel
export const WORKER_CONCURRENCY = Number(process.env.DOWNLOAD_WORKER_CONCURRENCY) || 5;

// Number of worker instances to spawn
export const WORKER_INSTANCES = Number(process.env.DOWNLOAD_WORKER_INSTANCES) || 3;
