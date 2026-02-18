import Redis from "ioredis";
import { config } from "dotenv";

config();

const REDIS_HOST = process.env.REDIS_HOST || "localhost";
const REDIS_PORT = Number(process.env.REDIS_PORT) || 6379;

export const redisClient = new Redis({
  host: REDIS_HOST,
  port: REDIS_PORT,
  maxRetriesPerRequest: 3,
  retryStrategy(times) {
    if (times > 5) {
      console.error("❌ Redis: max retries reached, giving up.");
      return null;
    }
    return Math.min(times * 200, 2000);
  },
});

redisClient.on("connect", () => {
  console.log("✅ Redis connected.");
});

redisClient.on("error", (err) => {
  console.error("❌ Redis error:", err.message);
});
