import {
  redisClient,
  logger,
  sendSmashPlusBriefEmail,
} from "../../helper-service/modules.export";
import { findUserById } from "../../persistence-service/user/user.persistence.service";
import {
  saveSmashPlusBrief,
  type SmashPlusBriefAttributes,
  type SmashPlusBriefMode,
} from "../../persistence-service/smash-plus/modules.export";

// ─── Rate limit ───────────────────────────────────────────────────────────────
//
// The endpoint is public and unauthenticated, and every accepted brief emails a
// real inbox, so it is throttled on both the caller's IP and the email typed
// into the form. Generous enough for an office behind one NAT, or one person
// sending an explore question and then a full brief.
//
// IP comes from getClientIp (leftmost X-Forwarded-For), which a caller can set
// themselves — the per-email limit is the backstop for that.
//
// FAILS OPEN: if Redis is down the brief is accepted. Losing a real lead to an
// infra blip is worse than a few extra emails.

const LIMITS = {
  ip: { max: 10, windowSec: 10 * 60 },
  email: { max: 5, windowSec: 60 * 60 },
} as const;

const REDIS_TIMEOUT_MS = 1000;

const hit = async (key: string, windowSec: number): Promise<number> => {
  const count = await redisClient.incr(key);
  if (count === 1) await redisClient.expire(key, windowSec);
  return count;
};

export const isSmashPlusBriefRateLimited = async (
  ip: string,
  email: string
): Promise<boolean> => {
  try {
    const counts = await Promise.race([
      Promise.all([
        hit(`smash-plus:brief:ip:${ip}`, LIMITS.ip.windowSec),
        hit(`smash-plus:brief:email:${email}`, LIMITS.email.windowSec),
      ]),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("redis timeout")), REDIS_TIMEOUT_MS)
      ),
    ]);
    const [ipCount, emailCount] = counts;
    return ipCount > LIMITS.ip.max || emailCount > LIMITS.email.max;
  } catch (err) {
    logger.error(`smash-plus brief rate limit skipped: ${(err as Error).message}`);
    return false;
  }
};

// ─── Save ─────────────────────────────────────────────────────────────────────

/** Validated body, as produced by smashPlusBriefSchema. */
export interface SmashPlusBriefInput {
  mode: SmashPlusBriefMode;
  name: string;
  company: string;
  email: string;
  placements: string[];
  question?: string;
  song?: string;
  exclusivity?: string;
  budget?: string;
  moods?: string[];
  reference?: string;
  term?: string;
  territory?: string;
  goLiveDate?: string;
}

// Which optional fields each mode actually asks. Anything outside its mode is
// discarded, so a stale FE build cannot file a reco mood under a brief.
const MODE_FIELDS: Record<SmashPlusBriefMode, (keyof SmashPlusBriefInput)[]> = {
  explore: ["question"],
  brief: ["song", "exclusivity", "budget", "term", "territory", "goLiveDate"],
  reco: ["moods", "reference", "term", "territory", "goLiveDate"],
};

const cleanList = (v?: string[]) => (v ?? []).map((s) => s.trim()).filter(Boolean);

export interface SmashPlusBriefContext {
  userId?: number;
  platform?: string;
  ipAddress: string;
  userAgent?: string;
}

export const submitSmashPlusBriefService = async (
  input: SmashPlusBriefInput,
  ctx: SmashPlusBriefContext
): Promise<{ briefId: string }> => {
  const row: SmashPlusBriefAttributes = {
    mode: input.mode,
    name: input.name,
    company: input.company,
    email: input.email,
    placements: cleanList(input.placements),
    platform: ctx.platform ?? null,
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent?.slice(0, 1000) ?? null,
  };

  for (const field of MODE_FIELDS[input.mode]) {
    const value = input[field];
    if (Array.isArray(value)) {
      const items = cleanList(value);
      if (items.length) (row as any)[field] = items;
    } else if (typeof value === "string" && value.trim() !== "") {
      (row as any)[field] = value.trim();
    }
  }

  // A signed-in submitter is linked to their account and brand. Best effort:
  // a lookup failure must not cost us the brief.
  if (ctx.userId) {
    row.userId = ctx.userId;
    try {
      const user = await findUserById(ctx.userId);
      row.brandId = user?.brandId ?? null;
    } catch (err) {
      logger.error(`smash-plus brief brand lookup failed for user ${ctx.userId}: ${(err as Error).message}`);
    }
  }

  // PERSISTED FIRST, and the only step allowed to fail the request.
  const brief = await saveSmashPlusBrief(row);
  const briefId = `SP-${brief.id}`;

  // Not awaited: the brief is already durable, so a mail outage must not tell
  // the visitor it failed and invite a resubmit. Recoverable from the table.
  void sendSmashPlusBriefEmail({ briefId, ...row }).catch((err: unknown) => {
    logger.error(`smash-plus brief ${briefId} notification failed: ${(err as Error).message}`);
  });

  return { briefId };
};
