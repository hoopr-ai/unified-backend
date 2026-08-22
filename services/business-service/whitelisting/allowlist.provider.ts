// ─── Platform allowlisting ───────────────────────────────────────────────────
//
// Marking a channel `whitelisted` in our database and allowlisting it on the
// PLATFORM are two different acts, and conflating them is the failure this
// dashboard exists to fix: a creator told they are cleared, whose videos keep
// getting claimed, because the second act never happened.
//
// So the two are tracked separately. `whitelistStatus` is our decision;
// `allowlistState` below is what the platform actually knows.
//
// ── Why there is no live API call here yet ──────────────────────────────────
//
// Neither integration is provisioned. Verified across the whole workspace:
//
//   YouTube  the only Google OAuth in the stack is NATIVE-BE's
//            youtube.readonly / yt-analytics.readonly (social/youtube/
//            youtube.client.ts) — read-only channel stats. Allowlisting a
//            channel against a reference is `youtubePartner.whitelists.insert`
//            on the YouTube Content ID API, which needs the `youtubepartner`
//            scope AND a linked CMS content-owner id. Neither exists.
//   Meta     Instagram and Facebook allowlisting is Rights Manager, which needs
//            Rights Manager access on a Business account plus the rights-manager
//            permissions on a Meta app. There is no Meta Graph credential of any
//            kind in this workspace.
//
// Rather than ship a button that silently does nothing, the provider is an
// interface with a MANUAL implementation that is honest about what happened: an
// operator did it by hand in YouTube Studio / Rights Manager and is recording
// that fact, with their own id against it. When credentials land, add the real
// implementations below and `providerFor()` starts returning them — no caller,
// no route and no UI changes.

import type { ChannelSource } from "./whitelisting-shared";

// What the platform knows, as distinct from what we decided.
//
//   NOT_STARTED   we have not tried
//   NOT_REQUIRED  deliberately skipped (e.g. the channel was rejected, or the
//                 track was never in Content ID to begin with)
//   SUBMITTED     handed to the platform, outcome not yet confirmed
//   CONFIRMED     the platform has it — the only state that means a creator's
//                 videos will actually stop being claimed
//   FAILED        the attempt errored; `allowlistError` says how
export const ALLOWLIST_STATES = [
  "NOT_STARTED",
  "NOT_REQUIRED",
  "SUBMITTED",
  "CONFIRMED",
  "FAILED",
] as const;
export type AllowlistState = (typeof ALLOWLIST_STATES)[number];

export const ALLOWLIST_STATE_LABELS: Record<AllowlistState, string> = {
  NOT_STARTED: "Not on platform yet",
  NOT_REQUIRED: "Not required",
  SUBMITTED: "Submitted to platform",
  CONFIRMED: "Live on platform",
  FAILED: "Platform push failed",
};

export const ALLOWLIST_PROVIDERS = ["manual", "youtube", "meta"] as const;
export type AllowlistProvider = (typeof ALLOWLIST_PROVIDERS)[number];

export interface AllowlistRequest {
  profileId: number;
  source: ChannelSource;
  /** Channel identifier as the platform knows it (UC…, IG id, FB page id). */
  identifier: string | null;
  handle: string | null;
  /** Operator-supplied evidence when the provider is `manual`. */
  reference?: string | null;
}

export interface AllowlistResult {
  state: AllowlistState;
  provider: AllowlistProvider;
  /** Provider-side id, or the operator's evidence reference on manual. */
  reference: string | null;
  error: string | null;
}

export interface AllowlistDriver {
  readonly provider: AllowlistProvider;
  /** True when this driver can actually reach its platform right now. */
  readonly available: boolean;
  push(req: AllowlistRequest): Promise<AllowlistResult>;
}

// ── Manual ──────────────────────────────────────────────────────────────────
//
// Always available, because a human with a browser is always available. Records
// CONFIRMED only when the operator supplies a reference — otherwise the state
// is SUBMITTED, i.e. "someone says they did it but left no evidence". That
// distinction is the entire value of the column.
const manualDriver: AllowlistDriver = {
  provider: "manual",
  available: true,
  async push(req) {
    const reference = (req.reference ?? "").trim() || null;
    return {
      state: reference ? "CONFIRMED" : "SUBMITTED",
      provider: "manual",
      reference,
      error: null,
    };
  },
};

// ── YouTube Content ID (not provisioned) ────────────────────────────────────
//
// Kept as a declared-unavailable driver rather than as a comment, so the CMS
// can render "YouTube API — not configured" from real data instead of the UI
// hard-coding an assumption about what the backend supports.
//
// To enable: obtain `https://www.googleapis.com/auth/youtubepartner` plus a CMS
// content-owner id, set YT_CONTENT_OWNER_ID, and implement push() as
// POST https://youtubepartner.googleapis.com/youtube/partner/v1/whitelists
//     ?onBehalfOfContentOwner=<id>   body { id: <channelId> }
const youtubeDriver: AllowlistDriver = {
  provider: "youtube",
  available: Boolean(process.env.YT_CONTENT_OWNER_ID),
  async push(req) {
    return {
      state: "FAILED",
      provider: "youtube",
      reference: null,
      error:
        "YouTube Content ID is not configured on this server (YT_CONTENT_OWNER_ID unset, " +
        "and the app holds only youtube.readonly scope). Clear the channel in YouTube " +
        `Studio and record it here as a manual allowlist. Channel: ${req.identifier ?? req.handle ?? req.profileId}`,
    };
  },
};

// ── Meta Rights Manager (not provisioned) ───────────────────────────────────
//
// To enable: a Meta app with Rights Manager permissions on the Business that
// owns the catalogue, then the allowlist edge on the Rights Manager API. Set
// META_RIGHTS_MANAGER_TOKEN and implement push().
const metaDriver: AllowlistDriver = {
  provider: "meta",
  available: Boolean(process.env.META_RIGHTS_MANAGER_TOKEN),
  async push(req) {
    return {
      state: "FAILED",
      provider: "meta",
      reference: null,
      error:
        "Meta Rights Manager is not configured on this server " +
        "(META_RIGHTS_MANAGER_TOKEN unset). Allowlist the account in Rights Manager " +
        `and record it here as a manual allowlist. Channel: ${req.identifier ?? req.handle ?? req.profileId}`,
    };
  },
};

/** The API driver that owns a given channel source, configured or not. */
export const apiDriverFor = (source: ChannelSource): AllowlistDriver =>
  source === "youtube" ? youtubeDriver : metaDriver;

/**
 * Resolve the driver for one push.
 *
 * `manual` is honoured whenever asked for — an operator who has already done it
 * by hand must always be able to say so, even once the APIs are live. Anything
 * else falls back to manual when its platform is not configured, so the CMS
 * never loses the ability to record the truth.
 */
export const providerFor = (
  source: ChannelSource,
  requested: AllowlistProvider = "manual",
): AllowlistDriver => {
  if (requested === "manual") return manualDriver;
  const driver = apiDriverFor(source);
  return driver.provider === requested && driver.available
    ? driver
    : driver.provider === requested
      ? driver // let it run and report its own "not configured" error
      : manualDriver;
};

/** Which providers the CMS should offer for a source, with live availability. */
export const providerOptionsFor = (
  source: ChannelSource,
): { provider: AllowlistProvider; label: string; available: boolean }[] => {
  const api = apiDriverFor(source);
  return [
    { provider: "manual", label: "Recorded manually", available: true },
    {
      provider: api.provider,
      label:
        api.provider === "youtube"
          ? "YouTube Content ID API"
          : "Meta Rights Manager API",
      available: api.available,
    },
  ];
};
