import {
  q,
  num,
  pct,
  per,
  delta,
  previousPeriod,
  filterBinds,
  rollupWhere,
  sessionWhere,
  type NativeFilters,
} from "./native-analytics-shared";

// Overview, time series and the platform breakdown — the three views that
// answer "how are we doing, and where". All read native_analytics_daily.

interface DailyTotals {
  sessions: number;
  unique_visitors: number;
  identified_sessions: number;
  anonymous_sessions: number;
  new_visitors: number;
  returning_visitors: number;
  page_views: number;
  events: number;
  total_duration: number;
  bounces: number;
  closed_sessions: number;
  signups: number;
  logins: number;
  plays: number;
  downloads: number;
  errors: number;
}

const TOTALS_SELECT = `
  COALESCE(sum(r.sessions), 0)               AS sessions,
  COALESCE(sum(r."uniqueVisitors"), 0)       AS unique_visitors,
  COALESCE(sum(r."identifiedSessions"), 0)   AS identified_sessions,
  COALESCE(sum(r."anonymousSessions"), 0)    AS anonymous_sessions,
  COALESCE(sum(r."newVisitors"), 0)          AS new_visitors,
  COALESCE(sum(r."returningVisitors"), 0)    AS returning_visitors,
  COALESCE(sum(r."pageViews"), 0)            AS page_views,
  COALESCE(sum(r.events), 0)                 AS events,
  COALESCE(sum(r."totalDurationSeconds"), 0) AS total_duration,
  COALESCE(sum(r.bounces), 0)                AS bounces,
  COALESCE(sum(r."closedSessions"), 0)       AS closed_sessions,
  COALESCE(sum(r.signups), 0)                AS signups,
  COALESCE(sum(r.logins), 0)                 AS logins,
  COALESCE(sum(r.plays), 0)                  AS plays,
  COALESCE(sum(r.downloads), 0)              AS downloads,
  COALESCE(sum(r.errors), 0)                 AS errors`;

const fetchTotals = async (f: NativeFilters): Promise<DailyTotals> => {
  const rows = await q<Record<keyof DailyTotals, unknown>>(
    `SELECT ${TOTALS_SELECT} FROM native_analytics_daily r WHERE ${rollupWhere("r")}`,
    filterBinds(f),
  );
  const r = rows[0] ?? ({} as Record<string, unknown>);
  return {
    sessions: num(r.sessions),
    unique_visitors: num(r.unique_visitors),
    identified_sessions: num(r.identified_sessions),
    anonymous_sessions: num(r.anonymous_sessions),
    new_visitors: num(r.new_visitors),
    returning_visitors: num(r.returning_visitors),
    page_views: num(r.page_views),
    events: num(r.events),
    total_duration: num(r.total_duration),
    bounces: num(r.bounces),
    closed_sessions: num(r.closed_sessions),
    signups: num(r.signups),
    logins: num(r.logins),
    plays: num(r.plays),
    downloads: num(r.downloads),
    errors: num(r.errors),
  };
};

/**
 * NOTE ON uniqueVisitors ACROSS A RANGE.
 *
 * The rollups store distinct visitors PER DAY, so summing them over a range
 * counts a visitor once per day they appeared. That is "daily unique visitors,
 * summed" — not "distinct visitors in the period", which cannot be derived from
 * a daily aggregate at all without keeping per-visitor state.
 *
 * It is surfaced as `visitorDaysUnique` — a name that says what it is — and
 * `visitors.exactUniqueVisitors` answers the real question from raw
 * native_sessions, which is retained indefinitely. Presenting the summed figure
 * as "unique visitors" would overstate reach by roughly the return rate, which
 * is exactly the number a founder would be most annoyed to find inflated.
 */
export const getOverviewService = async (f: NativeFilters) => {
  const prev = previousPeriod(f);
  const [current, previous, exact] = await Promise.all([
    fetchTotals(f),
    fetchTotals({ ...f, ...prev }),
    fetchExactVisitors(f),
  ]);

  const metric = (
    key: string,
    value: number,
    previousValue: number,
  ) => ({ key, value, previous: previousValue, delta: delta(value, previousValue) });

  return {
    range: { startDate: f.startDate, endDate: f.endDate },
    comparedWith: prev,
    filters: {
      userPlatform: f.userPlatform ?? null,
      clientType: f.clientType ?? null,
      os: f.os ?? null,
    },
    kpis: [
      metric("sessions", current.sessions, previous.sessions),
      metric(
        "visitorDaysUnique",
        current.unique_visitors,
        previous.unique_visitors,
      ),
      metric("pageViews", current.page_views, previous.page_views),
      metric("events", current.events, previous.events),
      metric(
        "avgSessionSeconds",
        per(current.total_duration, current.closed_sessions, 0),
        per(previous.total_duration, previous.closed_sessions, 0),
      ),
      metric(
        "bounceRate",
        pct(current.bounces, current.closed_sessions),
        pct(previous.bounces, previous.closed_sessions),
      ),
      metric(
        "pagesPerSession",
        per(current.page_views, current.sessions),
        per(previous.page_views, previous.sessions),
      ),
      metric("signups", current.signups, previous.signups),
      metric("logins", current.logins, previous.logins),
      metric("plays", current.plays, previous.plays),
      metric("downloads", current.downloads, previous.downloads),
      metric(
        "errorRate",
        pct(current.errors, current.events),
        pct(previous.errors, previous.events),
      ),
    ],
    // The headline of the whole exercise: how much of our traffic is people we
    // cannot name. Before this feature existed, the answer was unknowable.
    identity: {
      identifiedSessions: current.identified_sessions,
      anonymousSessions: current.anonymous_sessions,
      anonymousShare: pct(current.anonymous_sessions, current.sessions),
    },
    visitors: {
      new: current.new_visitors,
      returning: current.returning_visitors,
      returningShare: pct(
        current.returning_visitors,
        current.new_visitors + current.returning_visitors,
      ),
      // Distinct visitors over the whole window (not a sum of daily uniques).
      exactUniqueVisitors: exact,
    },
    // Sessions that have not closed yet carry no duration, so avg-duration and
    // bounce-rate divide by this rather than by `sessions`. Surfaced so the UI
    // can say what the averages are actually based on.
    closedSessions: current.closed_sessions,
  };
};

/**
 * True distinct visitors over the window, from raw native_sessions.
 *
 * Always available, for any range: only native_events is partitioned and
 * archived to GCS at 90 days. native_sessions is one small row per session (a
 * twentieth of the event volume) and is retained indefinitely, which is what
 * keeps session-level questions answerable over all history.
 */
const fetchExactVisitors = async (f: NativeFilters): Promise<number> => {
  const rows = await q<{ visitors: unknown }>(
    `SELECT count(DISTINCT s."visitorId") AS visitors
       FROM native_sessions s
      WHERE ${sessionWhere("s")}`,
    filterBinds(f),
  );
  return num(rows[0]?.visitors);
};

/**
 * Daily series for the charts.
 *
 * Gap-filled with generate_series so a day with no traffic renders as a zero
 * rather than being skipped — an unfilled series makes a two-day outage look
 * like a steep but continuous decline.
 */
export const getTimeseriesService = async (f: NativeFilters) => {
  const rows = await q<Record<string, unknown>>(
    `WITH days AS (
       SELECT generate_series((:startDate)::date, (:endDate)::date, interval '1 day')::date AS day
     ),
     agg AS (
       SELECT r.day,
              sum(r.sessions)               AS sessions,
              sum(r."uniqueVisitors")       AS unique_visitors,
              sum(r."identifiedSessions")   AS identified_sessions,
              sum(r."anonymousSessions")    AS anonymous_sessions,
              sum(r."newVisitors")          AS new_visitors,
              sum(r."returningVisitors")    AS returning_visitors,
              sum(r."pageViews")            AS page_views,
              sum(r.events)                 AS events,
              sum(r."totalDurationSeconds") AS total_duration,
              sum(r.bounces)                AS bounces,
              sum(r."closedSessions")       AS closed_sessions,
              sum(r.signups)                AS signups,
              sum(r.plays)                  AS plays,
              sum(r.downloads)              AS downloads,
              sum(r.errors)                 AS errors
         FROM native_analytics_daily r
        WHERE ${rollupWhere("r")}
        GROUP BY r.day
     )
     SELECT to_char(d.day, 'YYYY-MM-DD') AS day,
            COALESCE(a.sessions, 0)             AS sessions,
            COALESCE(a.unique_visitors, 0)      AS unique_visitors,
            COALESCE(a.identified_sessions, 0)  AS identified_sessions,
            COALESCE(a.anonymous_sessions, 0)   AS anonymous_sessions,
            COALESCE(a.new_visitors, 0)         AS new_visitors,
            COALESCE(a.returning_visitors, 0)   AS returning_visitors,
            COALESCE(a.page_views, 0)           AS page_views,
            COALESCE(a.events, 0)               AS events,
            COALESCE(a.total_duration, 0)       AS total_duration,
            COALESCE(a.bounces, 0)              AS bounces,
            COALESCE(a.closed_sessions, 0)      AS closed_sessions,
            COALESCE(a.signups, 0)              AS signups,
            COALESCE(a.plays, 0)                AS plays,
            COALESCE(a.downloads, 0)            AS downloads,
            COALESCE(a.errors, 0)               AS errors
       FROM days d
       LEFT JOIN agg a ON a.day = d.day
      ORDER BY d.day`,
    filterBinds(f),
  );

  return rows.map((r) => ({
    day: String(r.day),
    sessions: num(r.sessions),
    visitorDaysUnique: num(r.unique_visitors),
    identifiedSessions: num(r.identified_sessions),
    anonymousSessions: num(r.anonymous_sessions),
    newVisitors: num(r.new_visitors),
    returningVisitors: num(r.returning_visitors),
    pageViews: num(r.page_views),
    events: num(r.events),
    avgSessionSeconds: per(num(r.total_duration), num(r.closed_sessions), 0),
    bounceRate: pct(num(r.bounces), num(r.closed_sessions)),
    signups: num(r.signups),
    plays: num(r.plays),
    downloads: num(r.downloads),
    errors: num(r.errors),
    errorRate: pct(num(r.errors), num(r.events)),
  }));
};

/**
 * The platform breakdown — the "platform wise" view.
 *
 * Returns each of the three dimensions independently rather than the full
 * cross-product. The cross-product of platform × client × OS is mostly empty
 * cells, and the question being asked ("which platform is worse?") is answered
 * one dimension at a time; combinations are reachable by setting a filter.
 */
export const getPlatformsService = async (f: NativeFilters) => {
  const breakdown = async (column: string) => {
    const rows = await q<Record<string, unknown>>(
      `SELECT r."${column}" AS value, ${TOTALS_SELECT}
         FROM native_analytics_daily r
        WHERE ${rollupWhere("r")}
        GROUP BY r."${column}"
        ORDER BY sessions DESC`,
      filterBinds(f),
    );

    return rows.map((r) => ({
      value: String(r.value ?? "UNKNOWN"),
      sessions: num(r.sessions),
      visitorDaysUnique: num(r.unique_visitors),
      identifiedSessions: num(r.identified_sessions),
      anonymousSessions: num(r.anonymous_sessions),
      anonymousShare: pct(num(r.anonymous_sessions), num(r.sessions)),
      pageViews: num(r.page_views),
      events: num(r.events),
      avgSessionSeconds: per(num(r.total_duration), num(r.closed_sessions), 0),
      bounceRate: pct(num(r.bounces), num(r.closed_sessions)),
      pagesPerSession: per(num(r.page_views), num(r.sessions)),
      signups: num(r.signups),
      plays: num(r.plays),
      downloads: num(r.downloads),
      errorRate: pct(num(r.errors), num(r.events)),
    }));
  };

  const [userPlatform, clientType, os] = await Promise.all([
    breakdown("userPlatform"),
    breakdown("clientType"),
    breakdown("os"),
  ]);

  return { userPlatform, clientType, os };
};
