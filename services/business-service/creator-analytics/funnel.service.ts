// ─── The acquisition funnel ──────────────────────────────────────────────────
//
// Anonymous visitor → signup → subscription → first payment → renewal, with the
// money on the money rungs, for any window the reader picks.
//
// ── FIVE RUNGS, THREE OF WHICH ARE NOT THE SAME POPULATION ──────────────────
//
// This is the part that gets misread, so the payload labels every rung with its
// own denominator rather than implying one chain:
//
//   1. New visitors      — browsers whose FIRST EVER session started in the
//                          window. Anonymous: nobody has signed in yet.
//   2. Signups           — accounts created in the window.
//   3. Subscriptions     — subscription ROWS created in the window, comps
//                          included. A comp has no money behind it.
//   4. First payments    — plan-cycle money that arrived, cycle 1.
//   5. Renewals          — plan-cycle money that arrived, cycle 2+.
//
// Rungs 1–4 are a genuine narrowing and their step-to-step percentages mean
// what they look like. RENEWALS ARE NOT: a renewal collected this month belongs
// to someone who signed up months ago, so `renewals / firstPayments` is a ratio
// of two different cohorts and is reported as a rate against the window, never
// as "conversion from the previous step". The UI renders it as a separate block
// under the funnel for the same reason.
//
// ── WHY THE VISITOR RUNG IS COMPUTED GLOBALLY ───────────────────────────────
//
// `first_touch` is one `DISTINCT ON (visitorId)` over the whole table with the
// window applied AFTER. It looks wasteful; it is not, and it must stay this way
// — the "obviously better" form (scan the window, `NOT EXISTS` an earlier
// session) measured 87× WORSE on a two-day range, which is exactly the range
// the Today and Last-7-days chips ask for. The global form is flat in window
// size at ~2.5s. The full benchmark is in native-analytics/utm.service.ts; do
// not re-derive this without measuring BOTH a wide and a narrow window.
//
// ── WHY THE RUNGS ARE SEPARATE QUERIES ──────────────────────────────────────
//
// Only rung 1 is expensive. Fusing all five into one statement would put the
// cheap ones (0.15–0.6s) behind the slow one in a single plan the planner has
// to optimise as a whole. Run concurrently, the endpoint costs what its slowest
// rung costs.

import {
  q,
  num,
  pct,
  delta,
  previousPeriod,
  istDay,
  inRange,
  rangeBinds,
  originWhere,
  creatorUsersCte,
  captureStart,
  TX_SCOPE,
  TX_RENEWAL,
  TX_FIRST_PAYMENT,
  TX_UNCLASSIFIED,
  RENEWAL_NOTE,
  REVENUE_NOTE,
  ORIGIN_NOTE,
  SESSION_NOTE,
  type CreatorFilters,
} from "./creator-analytics-shared";

/**
 * Restricts session-side counting to the creator surface.
 *
 * Keeps `userPlatform IS NULL`, which is the entire point: a visitor is
 * anonymous until they sign in, so an `= 'CREATOR'` test would throw away the
 * anonymous traffic this rung exists to count. Both spellings are accepted
 * because raw rows store 'CREATOR' while the rollups use the older
 * 'SOUND_TRACKING_APP'.
 */
const CREATOR_SCOPE = `
  AND (s."userPlatform" IS NULL
       OR s."userPlatform" IN ('CREATOR', 'SOUND_TRACKING_APP'))`;

interface VisitorCounts {
  newVisitors: number;
  sessions: number;
  anonymousSessions: number;
  identifiedSessions: number;
}

/**
 * A window predicate over an explicitly named pair of bind keys.
 *
 * `inRange` is hardwired to :startDate/:endDate, which is right everywhere else
 * in this module. Here BOTH windows have to appear in one statement, so each
 * needs its own pair.
 */
const between = (col: string, from: string, to: string): string =>
  `${col} >= ((:${from})::date)::timestamp AT TIME ZONE 'Asia/Kolkata'
   AND ${col} < ((:${to})::date + 1)::timestamp AT TIME ZONE 'Asia/Kolkata'`;

/**
 * The traffic rung, for the window AND its comparison window at once.
 *
 * ── WHY BOTH WINDOWS SHARE ONE PASS ─────────────────────────────────────────
 *
 * `first_touch` is a `DISTINCT ON` over the whole of `native_sessions` — 1.4M
 * rows, ~2.5s, and deliberately unbounded (see the header). Its result does not
 * depend on the window at all: the window is applied to the row that falls out.
 * Calling this once per window therefore paid that scan TWICE for one number,
 * which measured 13.7s for the funnel endpoint. Computing it once and applying
 * both windows as FILTER clauses halves it, and no other shape available here
 * is cheaper — the scan is the cost.
 *
 * The in-window session counts stay a separate statement: they ride
 * `native_sessions_started_idx` and return in milliseconds, so folding them into
 * the same plan as the full scan would drag the cheap half up to the cost of the
 * expensive one.
 */
const visitorCounts = async (
  f: CreatorFilters,
  prev: { startDate: string; endDate: string },
): Promise<{ current: VisitorCounts; previous: VisitorCounts }> => {
  const binds = {
    ...rangeBinds(f),
    prevStartDate: prev.startDate,
    prevEndDate: prev.endDate,
  };

  const curr = between(`s."startedAt"`, "startDate", "endDate");
  const before = between(`s."startedAt"`, "prevStartDate", "prevEndDate");

  const [firstTouch, inWindow] = await Promise.all([
    q<{ new_visitors: string; prev_new_visitors: string }>(
      `WITH first_touch AS (
         SELECT DISTINCT ON (s."visitorId") s."visitorId", s."startedAt"
           FROM native_sessions s
          WHERE NOT s."isBot" ${CREATOR_SCOPE}
          ORDER BY s."visitorId", s."startedAt"
       )
       SELECT count(*) FILTER (WHERE ${curr})::bigint   AS new_visitors,
              count(*) FILTER (WHERE ${before})::bigint AS prev_new_visitors
         FROM first_touch s
        WHERE (${curr}) OR (${before})`,
      binds,
    ),
    q<Record<string, string>>(
      `SELECT count(*) FILTER (WHERE ${curr})::bigint                              AS sessions,
              count(*) FILTER (WHERE ${curr} AND s."userId" IS NULL)::bigint       AS anonymous,
              count(*) FILTER (WHERE ${curr} AND s."userId" IS NOT NULL)::bigint   AS identified,
              count(*) FILTER (WHERE ${before})::bigint                            AS prev_sessions,
              count(*) FILTER (WHERE ${before} AND s."userId" IS NULL)::bigint     AS prev_anonymous,
              count(*) FILTER (WHERE ${before} AND s."userId" IS NOT NULL)::bigint AS prev_identified
         FROM native_sessions s
        WHERE NOT s."isBot" ${CREATOR_SCOPE}
          AND ((${curr}) OR (${before}))`,
      binds,
    ),
  ]);

  const ft = firstTouch[0] ?? {};
  const w = inWindow[0] ?? {};

  return {
    current: {
      newVisitors: num(ft.new_visitors),
      sessions: num(w.sessions),
      anonymousSessions: num(w.anonymous),
      identifiedSessions: num(w.identified),
    },
    previous: {
      newVisitors: num(ft.prev_new_visitors),
      sessions: num(w.prev_sessions),
      anonymousSessions: num(w.prev_anonymous),
      identifiedSessions: num(w.prev_identified),
    },
  };
};

const NO_VISITORS: VisitorCounts = {
  newVisitors: 0,
  sessions: 0,
  anonymousSessions: 0,
  identifiedSessions: 0,
};

interface AccountCounts {
  signups: number;
  subscriptions: number;
  paidSubscriptions: number;
}

/** Rungs 2 and 3 — accounts and subscription rows, both origin-filterable. */
const accountCounts = async (
  f: CreatorFilters,
  usersCte: string,
): Promise<AccountCounts> => {
  const binds = rangeBinds(f);

  const [signups, subs] = await Promise.all([
    q<{ n: string }>(
      `WITH ${usersCte}
       SELECT count(*)::bigint AS n
         FROM creator_users cu
        WHERE ${inRange(`cu."createdAt"`)}
          AND ${originWhere("cu.origin")}`,
      binds,
    ),
    q<{ n: string; paid: string }>(
      `WITH ${usersCte}
       SELECT count(*)::bigint AS n,
              count(*) FILTER (
                WHERE s."razorpaySubscriptionId" IS NOT NULL
                   OR s."appleOriginalTxId" IS NOT NULL
              )::bigint AS paid
         FROM user_subscriptions s
         JOIN creator_users cu ON cu.id = s."userId"
        WHERE ${inRange(`s."createdAt"`)}
          AND ${originWhere("cu.origin")}`,
      binds,
    ),
  ]);

  return {
    signups: num(signups[0]?.n),
    subscriptions: num(subs[0]?.n),
    paidSubscriptions: num(subs[0]?.paid),
  };
};

interface MoneyCounts {
  firstPayments: number;
  firstPaymentUsers: number;
  firstPaymentRupees: number;
  renewals: number;
  renewalUsers: number;
  renewalRupees: number;
  unclassified: number;
  unclassifiedRupees: number;
  totalPayments: number;
  totalRupees: number;
}

/**
 * The money rungs, in one pass.
 *
 * One statement here, unlike the rungs above, because all three buckets are
 * FILTER clauses over the same small scan — splitting them would read
 * `transactions` three times for no gain.
 */
const moneyCounts = async (
  f: CreatorFilters,
  usersCte: string,
): Promise<MoneyCounts> => {
  const rows = await q<Record<string, string>>(
    `WITH ${usersCte}
     SELECT
       count(*) FILTER (WHERE ${TX_FIRST_PAYMENT})::bigint            AS first_n,
       count(DISTINCT t."userId") FILTER (WHERE ${TX_FIRST_PAYMENT})::bigint AS first_users,
       COALESCE(sum(t."totalAmount") FILTER (WHERE ${TX_FIRST_PAYMENT}), 0)  AS first_rupees,
       count(*) FILTER (WHERE ${TX_RENEWAL} IS TRUE)::bigint          AS renewal_n,
       count(DISTINCT t."userId") FILTER (WHERE ${TX_RENEWAL} IS TRUE)::bigint AS renewal_users,
       COALESCE(sum(t."totalAmount") FILTER (WHERE ${TX_RENEWAL} IS TRUE), 0) AS renewal_rupees,
       count(*) FILTER (WHERE ${TX_UNCLASSIFIED})::bigint             AS unclassified_n,
       COALESCE(sum(t."totalAmount") FILTER (WHERE ${TX_UNCLASSIFIED}), 0)   AS unclassified_rupees,
       count(*)::bigint                                               AS total_n,
       COALESCE(sum(t."totalAmount"), 0)                              AS total_rupees
       FROM transactions t
       JOIN creator_users cu ON cu.id = t."userId"
      WHERE ${TX_SCOPE}
        AND ${inRange(`t."createdAt"`)}
        AND ${originWhere("cu.origin")}`,
    rangeBinds(f),
  );

  const r = rows[0] ?? {};
  const round2 = (v: unknown): number => Math.round(num(v) * 100) / 100;

  return {
    firstPayments: num(r.first_n),
    firstPaymentUsers: num(r.first_users),
    firstPaymentRupees: round2(r.first_rupees),
    renewals: num(r.renewal_n),
    renewalUsers: num(r.renewal_users),
    renewalRupees: round2(r.renewal_rupees),
    unclassified: num(r.unclassified_n),
    unclassifiedRupees: round2(r.unclassified_rupees),
    totalPayments: num(r.total_n),
    totalRupees: round2(r.total_rupees),
  };
};

/** The account + money rungs for one window. Both are cheap and windowed. */
const gather = async (f: CreatorFilters, usersCte: string) => {
  const [accounts, money] = await Promise.all([
    accountCounts(f, usersCte),
    moneyCounts(f, usersCte),
  ]);
  return { accounts, money };
};

export interface FunnelStep {
  key: string;
  label: string;
  hint: string;
  value: number;
  /** Rupees on the money rungs, null elsewhere. */
  amountRupees: number | null;
  /** People behind the count, when it differs from the count itself. */
  uniqueUsers: number | null;
  /** % of the rung above. Null when there is no meaningful predecessor. */
  conversionFromPrevious: number | null;
  /** % of the top rung. Null for the same reason. */
  conversionFromTop: number | null;
  droppedFromPrevious: number | null;
  /** % change vs the preceding window of equal length. */
  deltaPct: number | null;
  previousValue: number;
  /** The drill-down this step opens. */
  metric: string | null;
  /** Set when the step could not be computed as asked. */
  unavailable?: string;
}

/**
 * GET /admin/creator-analytics/funnel
 *
 * The window's funnel, the same window one period earlier for the deltas, and
 * every caveat that has to travel with the numbers.
 */
export const getFunnelService = async (f: CreatorFilters) => {
  const usersCte = await creatorUsersCte();
  const prev = { ...f, ...previousPeriod(f) };

  // The visitor rung cannot be split by origin — origin is derived from a USER
  // account and an anonymous visitor has none. Returning the unfiltered number
  // next to filtered ones below would be the worst of the three options;
  // skipping it and saying why, on the step itself, is the least bad.
  const visitorsAvailable = !f.origin;

  const [traffic, current, previous, coverage] = await Promise.all([
    visitorsAvailable
      ? visitorCounts(f, prev)
      : Promise.resolve({ current: NO_VISITORS, previous: NO_VISITORS }),
    gather(f, usersCte),
    gather(prev, usersCte),
    captureStart(),
  ]);

  const visitors = traffic.current;
  const { accounts, money } = current;
  const p = { ...previous, visitors: traffic.previous };

  // The narrowing chain. Renewals are deliberately NOT in it — see the header.
  const chain: Array<Omit<FunnelStep, "conversionFromPrevious" | "conversionFromTop" | "droppedFromPrevious">> = [
    {
      key: "newVisitors",
      label: "New visitors",
      hint: "First-ever session by a browser in this window. Anonymous — nobody has signed in yet.",
      value: visitors.newVisitors,
      amountRupees: null,
      uniqueUsers: null,
      deltaPct: delta(visitors.newVisitors, p.visitors.newVisitors),
      previousValue: p.visitors.newVisitors,
      metric: null,
      ...(visitorsAvailable
        ? {}
        : {
            unavailable:
              "Not available when an origin filter is applied — origin is derived " +
              "from a user account, and these visitors have none yet.",
          }),
    },
    {
      key: "signups",
      label: "Signups",
      hint: "Creator accounts created in this window.",
      value: accounts.signups,
      amountRupees: null,
      uniqueUsers: null,
      deltaPct: delta(accounts.signups, p.accounts.signups),
      previousValue: p.accounts.signups,
      metric: "signups",
    },
    {
      key: "subscriptions",
      label: "Subscriptions started",
      hint: "Subscription rows created in this window, comped plans included.",
      value: accounts.subscriptions,
      amountRupees: null,
      uniqueUsers: null,
      deltaPct: delta(accounts.subscriptions, p.accounts.subscriptions),
      previousValue: p.accounts.subscriptions,
      metric: "subscriptions",
    },
    {
      key: "firstPayments",
      label: "First payments",
      hint: "Cycle-1 subscription money that actually arrived.",
      value: money.firstPayments,
      amountRupees: money.firstPaymentRupees,
      uniqueUsers: money.firstPaymentUsers,
      deltaPct: delta(money.firstPayments, p.money.firstPayments),
      previousValue: p.money.firstPayments,
      metric: "payments",
    },
  ];

  const top = chain[0].value;
  const steps: FunnelStep[] = chain.map((s, i) => {
    // A step whose predecessor is zero (or unavailable) gets null rather than a
    // fabricated 0% or 100%: "we could not measure this" and "nobody converted"
    // are different facts and the UI renders them differently.
    const prevStep = i === 0 ? null : chain[i - 1];
    const base = prevStep?.value ?? 0;
    const usable = prevStep !== null && base > 0 && !prevStep.unavailable;
    return {
      ...s,
      conversionFromPrevious: usable ? pct(s.value, base) : null,
      conversionFromTop: i === 0 || top === 0 || chain[0].unavailable ? null : pct(s.value, top),
      droppedFromPrevious: usable ? Math.max(0, base - s.value) : null,
    };
  });

  return {
    range: { startDate: f.startDate, endDate: f.endDate },
    previousRange: { startDate: prev.startDate, endDate: prev.endDate },
    origin: f.origin ?? null,
    steps,

    // Renewals sit beside the funnel, not inside it: a renewal collected in
    // this window belongs to a cohort that signed up in an earlier one.
    renewals: {
      count: money.renewals,
      uniqueUsers: money.renewalUsers,
      amountRupees: money.renewalRupees,
      deltaPct: delta(money.renewals, p.money.renewals),
      previousCount: p.money.renewals,
      amountDeltaPct: delta(money.renewalRupees, p.money.renewalRupees),
      previousAmountRupees: p.money.renewalRupees,
      metric: "payments",
      note: RENEWAL_NOTE,
    },

    // Payments that predate cycle stamping. Its own bucket, visibly, so the
    // first/renewal split can be read as incomplete rather than as wrong.
    unclassifiedPayments: {
      count: money.unclassified,
      amountRupees: money.unclassifiedRupees,
      metric: "payments",
    },

    revenue: {
      totalRupees: money.totalRupees,
      firstPaymentRupees: money.firstPaymentRupees,
      renewalRupees: money.renewalRupees,
      unclassifiedRupees: money.unclassifiedRupees,
      payments: money.totalPayments,
      deltaPct: delta(money.totalRupees, p.money.totalRupees),
      previousTotalRupees: p.money.totalRupees,
      averagePaymentRupees:
        money.totalPayments > 0
          ? Math.round((money.totalRupees / money.totalPayments) * 100) / 100
          : 0,
    },

    traffic: {
      available: visitorsAvailable,
      sessions: visitors.sessions,
      anonymousSessions: visitors.anonymousSessions,
      identifiedSessions: visitors.identifiedSessions,
      newVisitors: visitors.newVisitors,
      sessionsDeltaPct: delta(visitors.sessions, p.visitors.sessions),
      previousSessions: p.visitors.sessions,
      metric: "sessions",
    },

    paidSubscriptions: {
      count: accounts.paidSubscriptions,
      compedCount: Math.max(0, accounts.subscriptions - accounts.paidSubscriptions),
    },

    coverage: {
      /** First day `native_sessions` has any row. Null on an empty table. */
      sessionsFrom: coverage,
      /** True when the window reaches back past traffic capture. */
      windowPredatesCapture: Boolean(coverage && f.startDate < coverage),
    },

    notes: {
      sessions: SESSION_NOTE,
      renewals: RENEWAL_NOTE,
      revenue: REVENUE_NOTE,
      origin: ORIGIN_NOTE,
    },
  };
};

/**
 * GET /admin/creator-analytics/funnel/timeseries
 *
 * The same rungs, per IST day, for the trend chart under the funnel.
 *
 * Built by generate_series LEFT JOINed to each rung so a day with no activity
 * is a zero rather than a missing point — a line chart that simply skips empty
 * days draws a slope where there was a gap.
 */
export const getFunnelTimeseriesService = async (f: CreatorFilters) => {
  const usersCte = await creatorUsersCte();
  const binds = rangeBinds(f);

  const days = `
    days AS (
      SELECT to_char(d, 'YYYY-MM-DD') AS day
        FROM generate_series((:startDate)::date, (:endDate)::date, interval '1 day') d
    )`;

  const [visitorRows, accountRows, moneyRows] = await Promise.all([
    // Skipped entirely under an origin filter, for the reason in `gather`.
    f.origin
      ? Promise.resolve<Array<{ day: string; new_visitors: string; sessions: string }>>([])
      : q<{ day: string; new_visitors: string; sessions: string }>(
          `WITH first_touch AS (
             SELECT DISTINCT ON (s."visitorId") s."visitorId", s."startedAt"
               FROM native_sessions s
              WHERE NOT s."isBot" ${CREATOR_SCOPE}
              ORDER BY s."visitorId", s."startedAt"
           ),
           ft AS (
             SELECT ${istDay(`s."startedAt"`)} AS day, count(*)::bigint AS new_visitors
               FROM first_touch s
              WHERE ${inRange(`s."startedAt"`)}
              GROUP BY 1
           ),
           sess AS (
             SELECT ${istDay(`s."startedAt"`)} AS day, count(*)::bigint AS sessions
               FROM native_sessions s
              WHERE NOT s."isBot" ${CREATOR_SCOPE} AND ${inRange(`s."startedAt"`)}
              GROUP BY 1
           ),
           ${days}
           SELECT d.day,
                  COALESCE(ft.new_visitors, 0) AS new_visitors,
                  COALESCE(sess.sessions, 0)   AS sessions
             FROM days d
             LEFT JOIN ft   ON ft.day = d.day
             LEFT JOIN sess ON sess.day = d.day
            ORDER BY d.day`,
          binds,
        ),
    q<{ day: string; signups: string; subscriptions: string }>(
      `WITH ${usersCte},
       su AS (
         SELECT ${istDay(`cu."createdAt"`)} AS day, count(*)::bigint AS signups
           FROM creator_users cu
          WHERE ${inRange(`cu."createdAt"`)} AND ${originWhere("cu.origin")}
          GROUP BY 1
       ),
       sb AS (
         SELECT ${istDay(`s."createdAt"`)} AS day, count(*)::bigint AS subscriptions
           FROM user_subscriptions s
           JOIN creator_users cu ON cu.id = s."userId"
          WHERE ${inRange(`s."createdAt"`)} AND ${originWhere("cu.origin")}
          GROUP BY 1
       ),
       ${days}
       SELECT d.day,
              COALESCE(su.signups, 0)       AS signups,
              COALESCE(sb.subscriptions, 0) AS subscriptions
         FROM days d
         LEFT JOIN su ON su.day = d.day
         LEFT JOIN sb ON sb.day = d.day
        ORDER BY d.day`,
      binds,
    ),
    q<Record<string, string>>(
      `WITH ${usersCte},
       tx AS (
         SELECT ${istDay(`t."createdAt"`)} AS day,
                count(*) FILTER (WHERE ${TX_FIRST_PAYMENT})::bigint             AS first_n,
                COALESCE(sum(t."totalAmount") FILTER (WHERE ${TX_FIRST_PAYMENT}), 0)   AS first_rupees,
                count(*) FILTER (WHERE ${TX_RENEWAL} IS TRUE)::bigint           AS renewal_n,
                COALESCE(sum(t."totalAmount") FILTER (WHERE ${TX_RENEWAL} IS TRUE), 0) AS renewal_rupees,
                COALESCE(sum(t."totalAmount"), 0)                               AS total_rupees
           FROM transactions t
           JOIN creator_users cu ON cu.id = t."userId"
          WHERE ${TX_SCOPE} AND ${inRange(`t."createdAt"`)} AND ${originWhere("cu.origin")}
          GROUP BY 1
       ),
       ${days}
       SELECT d.day,
              COALESCE(tx.first_n, 0)        AS first_n,
              COALESCE(tx.first_rupees, 0)   AS first_rupees,
              COALESCE(tx.renewal_n, 0)      AS renewal_n,
              COALESCE(tx.renewal_rupees, 0) AS renewal_rupees,
              COALESCE(tx.total_rupees, 0)   AS total_rupees
         FROM days d
         LEFT JOIN tx ON tx.day = d.day
        ORDER BY d.day`,
      binds,
    ),
  ]);

  const visitorsByDay = new Map(visitorRows.map((r) => [r.day, r]));
  const moneyByDay = new Map(moneyRows.map((r) => [r.day, r]));
  const round2 = (v: unknown): number => Math.round(num(v) * 100) / 100;

  return {
    range: { startDate: f.startDate, endDate: f.endDate },
    origin: f.origin ?? null,
    trafficAvailable: !f.origin,
    points: accountRows.map((row) => {
      const v = visitorsByDay.get(row.day);
      const m = moneyByDay.get(row.day);
      return {
        day: row.day,
        newVisitors: v ? num(v.new_visitors) : null,
        sessions: v ? num(v.sessions) : null,
        signups: num(row.signups),
        subscriptions: num(row.subscriptions),
        firstPayments: num(m?.first_n),
        firstPaymentRupees: round2(m?.first_rupees),
        renewals: num(m?.renewal_n),
        renewalRupees: round2(m?.renewal_rupees),
        revenueRupees: round2(m?.total_rupees),
      };
    }),
  };
};
