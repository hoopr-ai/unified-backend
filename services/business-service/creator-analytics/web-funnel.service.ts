// ─── Creator Web product funnel ──────────────────────────────────────────────
//
// The single source of truth for "a person came to Creator Web — what did they
// do next, where did they drop off, and what led them to subscribe".
//
// ── WHY THIS IS NOT THE EXISTING /funnel ENDPOINT ───────────────────────────
//
// `funnel.service.ts` answers an ACQUISITION question — visitor → signup →
// subscription → revenue — and counts sessions and accounts. This answers a
// PRODUCT question: which things did people do inside the app, in order, and
// which step lost them. Same dashboard section, different unit of analysis, and
// fusing them would produce a funnel whose rungs are not the same population.
//
// ── ONE POPULATION, COUNTED ONE WAY ─────────────────────────────────────────
//
// Every event stage counts DISTINCT `visitorId`, never sessions and never a
// mix. `visitorId` is the durable `hoopr_vid` cookie creator-web's proxy mints,
// and it is the only identifier that exists at EVERY stage — a `userId` does
// not exist before signup, so a user-keyed funnel has no top at all.
//
// Two consequences worth stating before anyone divides one number by another:
//
//   · One person on two devices is two visitors and one user. A visitor-keyed
//     stage and a user-keyed stage are therefore NOT directly comparable, which
//     is why the conversion stage below carries its own denominator rather than
//     borrowing the one above it.
//   · `source = 'CLIENT'` is mandatory. Server-sourced rows are written by the
//     request interceptor, and before 2026-09-16 it minted a fresh visitor for
//     every unattributed API call — 80.6% of all session rows. Counting those
//     at the top of a funnel reads ~36x high.
//
// ── A STAGE WITH NO DATA IS NOT A STAGE WITH ZERO ───────────────────────────
//
// This is the whole reason the payload carries `coverageFrom` per stage.
// Instrumentation landed in waves: page views 2026-08-17, signup and checkout
// 2026-08-28, search and play 2026-09-15, and the auth and conversion events
// only when the creator-web deploy carrying them ships. A window that starts
// before an event existed has no data for that rung — and rendering that as
// "0 users, 100% drop-off" would report a catastrophe where there is only a
// missing counter.
//
// So each stage reports whether the requested window is inside its coverage,
// and the UI says "not yet instrumented" rather than drawing a zero. That is
// the difference between a dashboard that can be trusted and one that cannot.

import {
  q,
  num,
  round1,
  rangeBinds,
  inRange,
  type CreatorFilters,
} from "./creator-analytics-shared";

/** A rung, as declared. `events` is an OR — any one of them reaches the stage. */
interface StageSpec {
  key: string;
  label: string;
  /** What the person actually did, in product language. */
  hint: string;
  /** Any one of these events puts a visitor on this rung. */
  events: readonly string[];
  /**
   * True when this rung is the point of the product rather than a step toward
   * it — the UI leads with these.
   */
  milestone?: boolean;
}

/**
 * The funnel, derived from creator-web's own flow rather than from a template.
 *
 * Read `features/music/playGate` and `features/pricing/analytics.ts` before
 * changing the order: the paywall in this product is reached by PLAYING, not by
 * browsing, so PLAY sits above the gate and SEARCH is a side path rather than a
 * required step. A visitor who lands on a track page and presses play has taken
 * the shortest route to the money question without searching once.
 */
const STAGES: readonly StageSpec[] = [
  {
    key: "visited",
    label: "Visited",
    hint: "Opened any page on Creator Web",
    events: ["PAGE_VIEW"],
    milestone: true,
  },
  {
    key: "browsed",
    label: "Browsed",
    hint: "Searched, filtered, or opened a playlist",
    events: ["SEARCH", "FILTER_APPLIED", "PLAYLIST_OPEN", "RAIL_ITEM_CLICK"],
  },
  {
    key: "played",
    label: "Played a track",
    hint: "Heard the catalogue — the product's core value moment",
    events: ["TRACK_PLAY", "TRACK_PREVIEW", "TRACK_COMPLETE"],
    milestone: true,
  },
  {
    key: "hitGate",
    label: "Hit the paywall",
    hint: "Ran out of free plays, or asked for a download without a plan",
    events: ["PLAY_GATE_SHOWN"],
    milestone: true,
  },
  {
    key: "authStarted",
    label: "Asked to sign in",
    hint: "The auth overlay went up",
    events: ["LOGIN_STARTED"],
  },
  {
    key: "otpVerified",
    label: "Verified",
    hint: "Passed the OTP — an account exists from here",
    events: ["OTP_VERIFIED"],
  },
  {
    key: "signedUp",
    label: "Finished signing up",
    hint: "Completed onboarding. Returning logins are NOT counted here",
    events: ["SIGNUP_COMPLETED"],
    milestone: true,
  },
  {
    key: "downloaded",
    label: "Downloaded",
    hint: "Licensed a track — realised value",
    events: ["TRACK_DOWNLOAD"],
  },
  {
    key: "checkout",
    label: "Started checkout",
    hint: "Pressed Subscribe Now",
    // ADD_TO_CART is fired by the same press to satisfy GA4's ecommerce
    // sequence — there is no cart in this product. Both are listed because
    // either proves the press happened; the stage counts a visitor once.
    events: ["CHECKOUT_STARTED", "ADD_TO_CART"],
  },
  {
    key: "paymentInitiated",
    label: "Opened payment",
    hint: "Razorpay actually opened, so an order existed",
    events: ["PAYMENT_INITIATED"],
  },
  {
    key: "subscribed",
    label: "Subscribed",
    hint: "Payment settled and the plan is live",
    events: ["SUBSCRIPTION_STARTED", "PURCHASE_COMPLETED"],
    milestone: true,
  },
];

export interface FunnelStage {
  key: string;
  label: string;
  hint: string;
  events: readonly string[];
  milestone: boolean;
  /** Distinct visitors who reached this rung. Null when not measurable. */
  visitors: number | null;
  /** Distinct known accounts among them. Null before any event carries a user. */
  users: number | null;
  /** False when the window predates this stage's instrumentation. */
  measurable: boolean;
  /** First day any of this stage's events was ever seen, or null if never. */
  coverageFrom: string | null;
  /** Share of the rung above that reached this one. */
  stepPct: number | null;
  /** Share of the FIRST rung that reached this one. */
  overallPct: number | null;
  /** Visitors lost between the rung above and this one. */
  dropOff: number | null;
  dropOffPct: number | null;
}

/**
 * The window the caller asked for, as a half-open IST range.
 *
 * Bound rather than interpolated — unlike the FILTER-clause work in
 * overview.service.ts, every predicate here appears once.
 */
const WINDOW = inRange(`e."occurredAt"`);

/**
 * When each event was first and last seen, ever.
 *
 * Deliberately NOT windowed: the question is "does this event exist yet", which
 * a window cannot answer — an event absent from a window because it had not
 * shipped and one absent because nobody did it are the same zero, and telling
 * them apart is the entire point of `measurable`.
 */
const coverageOf = async (): Promise<Map<string, string>> => {
  const rows = await q<{ event_name: string; first_day: string }>(
    `SELECT "eventName" AS event_name,
            to_char(min("occurredAt") AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD') AS first_day
       FROM native_events
      WHERE NOT "isBot" AND source = 'CLIENT'
      GROUP BY 1`,
  );
  return new Map(rows.map((r) => [r.event_name, r.first_day]));
};

/**
 * GET /admin/creator-analytics/web-funnel
 *
 * One pass over `native_events`, one FILTER per stage. Twelve stages done the
 * obvious way would be twelve scans of the same rows for one answer.
 */
export const getWebFunnelService = async (f: CreatorFilters) => {
  const cols = STAGES.map((s) => {
    const names = s.events.map((e) => `'${e}'`).join(", ");
    return `count(DISTINCT e."visitorId") FILTER (
              WHERE e."eventName" IN (${names})
            )::bigint AS "${s.key}_visitors",
            count(DISTINCT e."userId") FILTER (
              WHERE e."eventName" IN (${names})
            )::bigint AS "${s.key}_users"`;
  });

  const [rows, coverage] = await Promise.all([
    q<Record<string, string>>(
      `SELECT ${cols.join(",\n            ")}
         FROM native_events e
        WHERE NOT e."isBot"
          -- CLIENT only. See the header: server rows are interceptor traffic
          -- and were 80.6% of all sessions before 2026-09-16.
          AND e.source = 'CLIENT'
          AND ${WINDOW}`,
      rangeBinds(f),
    ),
    coverageOf(),
  ]);

  const row = rows[0] ?? {};

  /** The window starts before this stage's first event, or it has none at all. */
  const measurableFrom = (spec: StageSpec): string | null => {
    const days = spec.events
      .map((e) => coverage.get(e))
      .filter((d): d is string => Boolean(d))
      .sort();
    return days[0] ?? null;
  };

  const stages: FunnelStage[] = [];
  let firstVisitors: number | null = null;
  let previous: number | null = null;

  for (const spec of STAGES) {
    const coverageFrom = measurableFrom(spec);
    // An event that has never fired is not measurable at all; one that fired
    // after this window started is not measurable FOR this window.
    const measurable = coverageFrom !== null && coverageFrom <= f.endDate;
    const visitors = measurable ? num(row[`${spec.key}_visitors`]) : null;
    const users = measurable ? num(row[`${spec.key}_users`]) : null;

    if (firstVisitors === null && visitors !== null) firstVisitors = visitors;

    // Step conversion is measured against the last rung that HAD a number, not
    // against the rung immediately above — an unmeasurable stage in the middle
    // would otherwise blank out every percentage below it, which is how one
    // missing counter turns a working funnel into an unreadable one.
    const stepPct =
      visitors !== null && previous !== null && previous > 0
        ? round1((visitors / previous) * 100)
        : null;
    const overallPct =
      visitors !== null && firstVisitors !== null && firstVisitors > 0
        ? round1((visitors / firstVisitors) * 100)
        : null;
    const dropOff =
      visitors !== null && previous !== null ? Math.max(0, previous - visitors) : null;
    const dropOffPct =
      dropOff !== null && previous !== null && previous > 0
        ? round1((dropOff / previous) * 100)
        : null;

    stages.push({
      key: spec.key,
      label: spec.label,
      hint: spec.hint,
      events: spec.events,
      milestone: Boolean(spec.milestone),
      visitors,
      users,
      measurable,
      coverageFrom,
      stepPct,
      overallPct,
      dropOff,
      dropOffPct,
    });

    if (visitors !== null) previous = visitors;
  }

  // The biggest measurable leak, which is the one question a funnel exists to
  // answer. Computed here rather than in the UI so every reader of this
  // endpoint agrees about which step is the problem.
  const leak = stages
    .filter((s) => s.dropOff !== null && s.measurable)
    .sort((a, b) => (b.dropOff ?? 0) - (a.dropOff ?? 0))[0];

  return {
    range: { startDate: f.startDate, endDate: f.endDate },
    stages,
    biggestLeak: leak
      ? { key: leak.key, label: leak.label, dropOff: leak.dropOff, dropOffPct: leak.dropOffPct }
      : null,
    notes: {
      population:
        "Every stage counts DISTINCT visitors — the durable hoopr_vid cookie — " +
        "never sessions. One person on two devices is two visitors and one " +
        "user, so a visitor figure and a user figure are not interchangeable.",
      coverage:
        "A stage marked not measurable has no counter for this window, which " +
        "is NOT the same as nobody reaching it. Instrumentation shipped in " +
        "waves: page views from 2026-08-17, signup and checkout from " +
        "2026-08-28, search and play from 2026-09-15, and the auth and " +
        "payment events from the creator-web release that carries them.",
      web:
        "Creator Web only. The mobile apps emit no events at all (0 of 2.5M " +
        "sessions are MOBILE_APP), so app users appear nowhere in this funnel " +
        "— including at the subscription rung, where the database would " +
        "otherwise silently include them.",
      cart:
        "ADD_TO_CART and CHECKOUT_STARTED are one press. There is no cart in " +
        "this product; both are emitted to satisfy GA4's ecommerce sequence, " +
        "so they are one stage here and a visitor is counted once.",
    },
  };
};
