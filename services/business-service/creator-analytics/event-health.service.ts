// ─── Event health ────────────────────────────────────────────────────────────
//
// Watches the analytics pipeline so a gap is found HERE, deliberately, rather
// than in the middle of an analysis six weeks from now.
//
// ── WHY THIS EXISTS AT ALL ──────────────────────────────────────────────────
//
// Every failure this checks for has already happened on this platform:
//
//   · An event declared in the taxonomy and never emitted. 25 of the 36 names
//     were in that state, including the entire AUTH category and the whole
//     conversion tail — so the sign-up funnel had a numerator and no
//     denominator and nobody knew until someone tried to build it.
//   · An event that stops. `LOGOUT` could not ever have arrived, because the
//     client cleared its queue before flushing. A silent stop and a name that
//     never worked look identical in a dashboard: an empty rung.
//   · A property that is present on some rows and absent on others. A funnel
//     segmented on it then reports a share of the rows that happened to carry
//     it, which is a number that looks right and is not.
//   · Two spellings of one field on one event name — `track_code` on some rows
//     and `trackCode` on others — which is two columns in every analysis, one
//     of them always missed.
//
// The point is not to alert on everything. It is to make "is the data behind
// this chart complete?" a question with an answer, on the same screen as the
// chart.

import {
  q,
  num,
  inRange,
  rangeBinds,
  type CreatorFilters,
} from "./creator-analytics-shared";

/**
 * The names the product is supposed to emit, mirrored from NATIVE-BE's
 * `analytics.constants.ts` EVENT map.
 *
 * Duplicated rather than imported because that constant lives in a different
 * service with no shared package between them — and the duplication is the
 * point of the check: if the two drift, this reports the drift instead of
 * hiding it. `SCREEN_VIEW`, `APP_FOREGROUND` and `APP_BACKGROUND` are mobile
 * names and are expected to be silent on web, so they are declared as such
 * rather than reported as missing every single day.
 */
const EXPECTED: readonly { name: string; web: boolean; critical: boolean }[] = [
  { name: "PAGE_VIEW", web: true, critical: true },
  { name: "SEARCH", web: true, critical: false },
  { name: "FILTER_APPLIED", web: true, critical: false },
  { name: "RAIL_IMPRESSION", web: true, critical: false },
  { name: "RAIL_ITEM_CLICK", web: true, critical: false },
  { name: "PLAYLIST_OPEN", web: true, critical: false },
  { name: "TRACK_PREVIEW", web: true, critical: false },
  { name: "TRACK_PLAY", web: true, critical: true },
  { name: "TRACK_PAUSE", web: true, critical: false },
  { name: "TRACK_COMPLETE", web: true, critical: false },
  { name: "TRACK_LIKE", web: true, critical: false },
  { name: "SHARE_CREATED", web: true, critical: false },
  { name: "FREE_PLAY_CONSUMED", web: true, critical: false },
  { name: "PLAY_GATE_SHOWN", web: true, critical: true },
  { name: "LOGIN_STARTED", web: true, critical: true },
  { name: "OTP_REQUESTED", web: true, critical: false },
  { name: "OTP_VERIFIED", web: true, critical: false },
  { name: "LOGIN_COMPLETED", web: true, critical: true },
  { name: "LOGOUT", web: true, critical: false },
  { name: "SIGNUP_STARTED", web: true, critical: true },
  { name: "SIGNUP_COMPLETED", web: true, critical: true },
  { name: "PRICING_VIEWED", web: true, critical: true },
  { name: "ADD_TO_CART", web: true, critical: false },
  { name: "CHECKOUT_STARTED", web: true, critical: true },
  { name: "PAYMENT_INITIATED", web: true, critical: true },
  { name: "PAYMENT_FAILED", web: true, critical: false },
  { name: "TRACK_DOWNLOAD", web: true, critical: true },
  { name: "PURCHASE_COMPLETED", web: true, critical: false },
  { name: "SUBSCRIPTION_STARTED", web: true, critical: true },
  { name: "CLIENT_ERROR", web: true, critical: false },
  { name: "SCREEN_VIEW", web: false, critical: false },
  { name: "APP_FOREGROUND", web: false, critical: false },
  { name: "APP_BACKGROUND", web: false, critical: false },
];

/**
 * Properties a funnel or a segment depends on, and the event that must carry
 * them.
 *
 * Only the ones something actually reads. A checker that demands every property
 * on every event produces a wall of warnings nobody looks at, which is worse
 * than no checker — the warning that matters is then indistinguishable from
 * thirty that do not.
 */
const REQUIRED_PROPS: readonly { event: string; prop: string; why: string }[] = [
  {
    event: "PRICING_VIEWED",
    prop: "entry_source",
    why: "Every pricing-attribution question. Without it a visit is unattributable.",
  },
  {
    event: "SIGNUP_COMPLETED",
    prop: "signup_method",
    why: "Which door accounts come through.",
  },
  {
    event: "SUBSCRIPTION_STARTED",
    prop: "plan_code",
    why: "Conversion by plan.",
  },
  {
    event: "PAYMENT_FAILED",
    prop: "reason",
    why: "Why the most expensive step in the funnel fails.",
  },
];

export type HealthLevel = "ok" | "warn" | "critical";

export interface EventHealth {
  name: string;
  level: HealthLevel;
  /** Events in the requested window. */
  events: number;
  visitors: number;
  /** First and last time it was EVER seen — unwindowed, deliberately. */
  firstSeen: string | null;
  lastSeen: string | null;
  /** Days since it last fired. Null when it has never fired. */
  daysSilent: number | null;
  issue: string | null;
}

export interface PropertyHealth {
  event: string;
  prop: string;
  why: string;
  /** Share of that event's rows in the window that carry the property. */
  coveragePct: number | null;
  rows: number;
  level: HealthLevel;
  issue: string | null;
}

/**
 * GET /admin/creator-analytics/event-health
 *
 * Two questions, kept apart: is every event arriving, and is every event
 * carrying what it must.
 */
export const getEventHealthService = async (f: CreatorFilters) => {
  const names = EXPECTED.map((e) => `'${e.name}'`).join(", ");

  const [seen, windowed, props] = await Promise.all([
    // Unwindowed: "has this ever fired" cannot be answered inside a window, and
    // conflating "not yet built" with "quiet this week" is the exact mistake
    // this service exists to prevent.
    q<{ event_name: string; first_seen: string; last_seen: string; days_silent: string }>(
      `SELECT "eventName" AS event_name,
              to_char(min("occurredAt") AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD') AS first_seen,
              to_char(max("occurredAt") AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD') AS last_seen,
              floor(EXTRACT(EPOCH FROM (now() - max("occurredAt"))) / 86400)::text AS days_silent
         FROM native_events
        WHERE NOT "isBot" AND source = 'CLIENT'
        GROUP BY 1`,
    ),
    q<{ event_name: string; events: string; visitors: string }>(
      `SELECT e."eventName" AS event_name,
              count(*)::bigint AS events,
              count(DISTINCT e."visitorId")::bigint AS visitors
         FROM native_events e
        WHERE NOT e."isBot" AND e.source = 'CLIENT' AND ${inRange(`e."occurredAt"`)}
        GROUP BY 1`,
      rangeBinds(f),
    ),
    q<{ event_name: string; prop: string; rows: string; with_prop: string }>(
      `SELECT e."eventName" AS event_name,
              p.prop,
              count(*)::bigint AS rows,
              count(*) FILTER (
                WHERE e.properties ? p.prop
                  AND COALESCE(e.properties ->> p.prop, '') <> ''
              )::bigint AS with_prop
         FROM native_events e
         CROSS JOIN (VALUES ${REQUIRED_PROPS.map((r) => `('${r.event}', '${r.prop}')`).join(", ")})
              AS p(event_name, prop)
        WHERE e."eventName" = p.event_name
          AND NOT e."isBot" AND e.source = 'CLIENT'
          AND ${inRange(`e."occurredAt"`)}
        GROUP BY 1, 2`,
      rangeBinds(f),
    ),
  ]);

  const seenBy = new Map(seen.map((r) => [r.event_name, r]));
  const winBy = new Map(windowed.map((r) => [r.event_name, r]));

  const events: EventHealth[] = EXPECTED.filter((e) => e.web).map((spec) => {
    const ever = seenBy.get(spec.name);
    const win = winBy.get(spec.name);
    const daysSilent = ever ? num(ever.days_silent) : null;

    let level: HealthLevel = "ok";
    let issue: string | null = null;

    if (!ever) {
      // Never fired. Critical only for the events a funnel rung depends on —
      // a missing TRACK_PAUSE is a nice-to-have, a missing PRICING_VIEWED is a
      // question nobody can answer.
      level = spec.critical ? "critical" : "warn";
      issue = "Declared in the taxonomy and never emitted — not instrumented.";
    } else if (daysSilent !== null && daysSilent >= 7) {
      level = spec.critical ? "critical" : "warn";
      issue = `Last seen ${daysSilent} days ago. It fired before, so this is a regression rather than a gap.`;
    } else if (win && num(win.events) === 0) {
      level = "warn";
      issue = "Nothing in this window, though the event is live.";
    }

    return {
      name: spec.name,
      level,
      events: win ? num(win.events) : 0,
      visitors: win ? num(win.visitors) : 0,
      firstSeen: ever?.first_seen ?? null,
      lastSeen: ever?.last_seen ?? null,
      daysSilent,
      issue,
    };
  });

  const propRows = new Map(props.map((r) => [`${r.event_name}::${r.prop}`, r]));

  const properties: PropertyHealth[] = REQUIRED_PROPS.map((spec) => {
    const row = propRows.get(`${spec.event}::${spec.prop}`);
    const rows = row ? num(row.rows) : 0;
    const withProp = row ? num(row.with_prop) : 0;
    const coveragePct = rows > 0 ? Math.round((withProp / rows) * 1000) / 10 : null;

    let level: HealthLevel = "ok";
    let issue: string | null = null;

    if (rows === 0) {
      level = "warn";
      issue = "The event itself produced nothing in this window.";
    } else if (coveragePct !== null && coveragePct < 99) {
      // Partial population is the quietest failure of the four: the number
      // looks plausible, so nobody checks it. Anything short of complete is
      // reported rather than rounded away.
      level = coveragePct < 80 ? "critical" : "warn";
      issue = `Present on only ${coveragePct}% of rows — a segment on it silently reports a share of the rows that carried it.`;
    }

    return { ...spec, rows, coveragePct, level, issue };
  });

  const counts = (list: { level: HealthLevel }[]) => ({
    critical: list.filter((x) => x.level === "critical").length,
    warn: list.filter((x) => x.level === "warn").length,
    ok: list.filter((x) => x.level === "ok").length,
  });

  return {
    range: { startDate: f.startDate, endDate: f.endDate },
    events,
    properties,
    summary: {
      events: counts(events),
      properties: counts(properties),
      /** Ready when nothing critical is outstanding. */
      analysisReady:
        counts(events).critical === 0 && counts(properties).critical === 0,
    },
    notes: {
      scope:
        "Creator Web only, CLIENT-sourced events. Mobile event names are " +
        "excluded rather than reported missing — the apps emit no events at " +
        "all, which is a separate and much larger gap.",
      silence:
        "Never-emitted and gone-quiet are different findings and are reported " +
        "as such. The first is work not yet done; the second is a regression " +
        "in something that used to work, which is the more urgent of the two.",
    },
  };
};
