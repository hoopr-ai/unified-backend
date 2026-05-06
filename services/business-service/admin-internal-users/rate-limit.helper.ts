import { redisClient } from "../../helper-service/redis.client";

const RESET_RATE_LIMIT_WINDOW_SECONDS = 60;
const KEY = (targetUserId: number) => `ratelimit:internal-reset:${targetUserId}`;

interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number; // 0 when allowed
}

// Atomic 60s-per-target rate limit for the password-reset endpoint. Spec rationale:
// stop the endpoint being abused as an email-bombing vector against a specific employee.
// SET key 1 EX 60 NX → returns "OK" iff key did not exist; null otherwise.
// On miss we fetch TTL to populate Retry-After.
export const tryAcquireResetRateLimit = async (
  targetUserId: number
): Promise<RateLimitResult> => {
  const key = KEY(targetUserId);
  const acquired = await redisClient.set(
    key,
    "1",
    "EX",
    RESET_RATE_LIMIT_WINDOW_SECONDS,
    "NX"
  );
  if (acquired === "OK") {
    return { allowed: true, retryAfterSeconds: 0 };
  }
  const ttl = await redisClient.ttl(key);
  // ttl can be -1 (no expiry) or -2 (key not found). Be defensive — if either,
  // fall back to the full window so the client doesn't see a confusing Retry-After.
  const retry = ttl > 0 ? ttl : RESET_RATE_LIMIT_WINDOW_SECONDS;
  return { allowed: false, retryAfterSeconds: retry };
};
