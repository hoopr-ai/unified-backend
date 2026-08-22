import {
  q,
  num,
  pct,
  per,
  filterBinds,
  rollupWhere,
  type NativeFilters,
} from "./native-analytics-shared";

// Pages/screens, event frequency and the conversion funnel. All rollup-backed,
// so every one of these works over unbounded history.

/**
 * Top pages, entry pages and exit pages.
 *
 * `exits` is the number the product team actually wants: the page a session was
 * last seen on. A high exit count on a checkout step is a bug report; the same
 * count on the confirmation page is success. The dashboard shows both and lets
 * the reader decide, rather than trying to guess intent here.
 */
export const getPagesService = async (f: NativeFilters) => {
  const rows = await q<Record<string, unknown>>(
    `SELECT r.path,
            COALESCE(sum(r.views), 0)             AS views,
            COALESCE(sum(r."uniqueSessions"), 0)  AS unique_sessions,
            COALESCE(sum(r."totalDurationMs"), 0) AS total_duration_ms,
            COALESCE(sum(r."durationSamples"), 0) AS duration_samples,
            COALESCE(sum(r.entries), 0)           AS entries,
            COALESCE(sum(r.exits), 0)             AS exits
       FROM native_analytics_daily_page r
      WHERE ${rollupWhere("r")}
      GROUP BY r.path
      ORDER BY views DESC
      LIMIT 300`,
    filterBinds(f),
  );

  const shaped = rows.map((r) => {
    const views = num(r.views);
    const samples = num(r.duration_samples);
    return {
      path: String(r.path),
      views,
      uniqueSessions: num(r.unique_sessions),
      entries: num(r.entries),
      exits: num(r.exits),
      // Divided by the number of views that actually REPORTED a duration, not
      // by all views: a client that navigated away without sending one would
      // otherwise drag every average toward zero.
      avgTimeOnPageMs: samples > 0 ? Math.round(num(r.total_duration_ms) / samples) : null,
      exitRate: pct(num(r.exits), views),
    };
  });

  return {
    pages: shaped,
    entryPages: [...shaped]
      .filter((p) => p.entries > 0)
      .sort((a, b) => b.entries - a.entries)
      .slice(0, 50),
    exitPages: [...shaped]
      .filter((p) => p.exits > 0)
      .sort((a, b) => b.exits - a.exits)
      .slice(0, 50),
  };
};

/** Event frequency table, grouped by category for the UI's sections. */
export const getEventsService = async (f: NativeFilters) => {
  const rows = await q<Record<string, unknown>>(
    `SELECT r."eventName",
            min(r."eventCategory")                AS event_category,
            COALESCE(sum(r.count), 0)             AS count,
            COALESCE(sum(r."uniqueSessions"), 0)  AS unique_sessions,
            COALESCE(sum(r."uniqueVisitors"), 0)  AS unique_visitors
       FROM native_analytics_daily_event r
      WHERE ${rollupWhere("r")}
      GROUP BY r."eventName"
      ORDER BY count DESC
      LIMIT 300`,
    filterBinds(f),
  );

  const events = rows.map((r) => ({
    eventName: String(r.eventName),
    eventCategory: String(r.event_category ?? "SYSTEM"),
    count: num(r.count),
    uniqueSessions: num(r.unique_sessions),
    visitorDaysUnique: num(r.unique_visitors),
    perSession: per(num(r.count), num(r.unique_sessions)),
  }));

  const byCategory = new Map<string, number>();
  for (const e of events) {
    byCategory.set(e.eventCategory, (byCategory.get(e.eventCategory) ?? 0) + e.count);
  }

  return {
    events,
    categories: [...byCategory.entries()]
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count),
  };
};

/**
 * The conversion funnel, with per-step drop-off.
 *
 * Two caveats worth knowing before reading the numbers, both baked into how the
 * rollup counts:
 *
 * 1. Steps are NOT required in order. A session counts for a step if it produced
 *    any of that step's events, so a returning user landing straight on checkout
 *    is counted at CONVERT without being counted at BROWSE. Requiring strict
 *    ordering would invent drop-off in the middle steps that never happened.
 *
 * 2. Because of (1), a later step can exceed an earlier one. The conversion
 *    rates below are therefore always relative to step 0 (VISIT) and to the
 *    immediately preceding step, and `dropOffFromPrevious` is clamped at zero
 *    rather than reported as a negative loss.
 */
export const getFunnelService = async (f: NativeFilters) => {
  const rows = await q<Record<string, unknown>>(
    `SELECT r."stepIndex",
            min(r."stepKey")                     AS step_key,
            COALESCE(sum(r.sessions), 0)         AS sessions,
            COALESCE(sum(r."uniqueVisitors"), 0) AS unique_visitors
       FROM native_analytics_daily_funnel r
      WHERE ${rollupWhere("r")}
      GROUP BY r."stepIndex"
      ORDER BY r."stepIndex"`,
    filterBinds(f),
  );

  const steps = rows.map((r) => ({
    stepIndex: num(r.stepIndex),
    stepKey: String(r.step_key),
    sessions: num(r.sessions),
    visitorDaysUnique: num(r.unique_visitors),
  }));

  const top = steps[0]?.sessions ?? 0;

  return {
    steps: steps.map((s, i) => {
      const previous = i === 0 ? s.sessions : steps[i - 1].sessions;
      const lost = Math.max(0, previous - s.sessions);
      return {
        ...s,
        conversionFromStart: pct(s.sessions, top),
        conversionFromPrevious: pct(s.sessions, previous),
        dropOffFromPrevious: lost,
        dropOffRateFromPrevious: pct(lost, previous),
      };
    }),
    // The single number a PM asks for first.
    overallConversion: pct(steps[steps.length - 1]?.sessions ?? 0, top),
  };
};
