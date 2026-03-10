/**
 * Standalone Download Worker Process
 *
 * Run separately from the main API server to avoid affecting API performance.
 *
 * Usage:
 *   npm run worker        # Start workers
 *   npm run worker:dev    # Start workers with hot reload
 */

import "dotenv/config";
import {
  initializeDownloadWorkers,
  shutdownDownloadWorkers,
} from "./services/helper-service/download-queue";

console.log("🚀 Starting Download Worker Process...");
console.log(`   PID: ${process.pid}`);
console.log(`   Environment: ${process.env.NODE_ENV || "development"}`);

// Initialize workers
initializeDownloadWorkers();

// Graceful shutdown
const shutdown = async (signal: string) => {
  console.log(`\n${signal} received. Shutting down workers...`);
  await shutdownDownloadWorkers();
  console.log("Worker process terminated gracefully");
  process.exit(0);
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

// Keep process alive
console.log("✅ Worker process running. Press Ctrl+C to stop.");
