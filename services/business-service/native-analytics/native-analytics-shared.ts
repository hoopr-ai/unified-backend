// ─── Native analytics shared helpers ─────────────────────────────────────────
//
// Read-only aggregates for the internal-fe "Native Analytics" dashboard, over
// the session/event tables that NATIVE-BE writes (native_sessions,
// native_events) and the daily rollups it computes from them
// (native_analytics_daily and friends).
//
// WHY THESE LIVE HERE AND NOT IN NATIVE-BE: NATIVE-BE points at the same shared
// Postgres, so there is no service hop to make — and this service already owns
// internal-user sessions, roles and the functionality grants these endpoints
// need to be gated by. NATIVE-BE writes; unified reads.
//
// WHAT READS ROLLUPS vs RAW:
//   · Aggregate views (overview, timeseries, platforms, geography, pages,
//     events, funnel) read the ROLLUP tables. They are keyed by IST calendar
//     day, are three-to-four orders of magnitude smaller than raw, and — the
//     point — survive raw partitions being archived to GCS at 90 days, so
//     dashboard history is unbounded.
//   · Per-session drill-down (the session explorer, one session's timeline)
//     reads RAW. Those rows are only present for the retention window; beyond
//     it the archive ledger says where they went.
//
// Column names in these tables are camelCase, so every identifier is quoted.

import {
  q,
  num,
  pct,
  round1,
  istDay,
} from "../enterprise-analytics/analytics-shared";

// Re-exported so the services in this folder have one import site, and so the
// IST/aggregation conventions stay identical to the enterprise dashboards. Two
// internal dashboards that disagree about when "yesterday" ended is a support
// ticket nobody can close.
export { q, num, pct, round1, istDay };

/** The three dashboard filters, plus the date window. All optional but dates. */
export interface NativeFilters {
  /** Inclusive IST calendar day, YYYY-MM-DD. */
  startDate: string;
  /** Inclusive IST calendar day, YYYY-MM-DD. */
  endDate: string;
  /** users.platform — CREATOR | ENTERPRISE | SOUND_TRACKING_APP | STUDIO | INTERNAL. */
  userPlatform?: string | null;
  /** BROWSER | MOBILE_APP. */
  clientType?: string | null;
  /** iOS | macOS | Android | Windows | Linux | ChromeOS | Other. */
  os?: string | null;
  [key: string]: unknown;
}

/**
 * Bind values for every query in this folder.
 *
 * An omitted filter is bound as NULL and the predicates below then match
 * everything — which is why each one is written as
 * `(CAST(:x AS text) IS NULL OR col = :x)` rather than assembled
 * conditionally. One SQL string per endpoint is far easier to read and to
 * reason about than a string built from fragments.
 */
export const filterBinds = (f: NativeFilters): Record<string, unknown> => ({
  startDate: f.startDate,
  endDate: f.endDate,
  userPlatform: f.userPlatform ?? null,
  clientType: f.clientType ?? null,
  os: f.os ?? null,
});

/**
 * WHERE clause for a rollup table.
 *
 * `CAST(:x AS text)` rather than `:x::text` deliberately: Sequelize's named-
 * replacement scanner and Postgres's `::` cast operator both want the colon,
 * and the combination is a known source of mangled SQL. The CAST form is
 * unambiguous.
 *
 * Rollup dimension columns are NOT NULL with an 'UNKNOWN' default, so plain
 * equality is correct here — no COALESCE needed (unlike `sessionWhere`).
 */
export const rollupWhere = (alias = "r"): string => `
  ${alias}.day >= (:startDate)::date
  AND ${alias}.day <= (:endDate)::date
  AND (CAST(:userPlatform AS text) IS NULL OR ${alias}."userPlatform" = :userPlatform)
  AND (CAST(:clientType AS text) IS NULL OR ${alias}."clientType" = :clientType)
  AND (CAST(:os AS text) IS NULL OR ${alias}."os" = :os)`;

/**
 * WHERE clause for raw native_sessions.
 *
 * COALESCE to 'UNKNOWN' on each dimension, because these columns ARE nullable
 * here (a session is anonymous until it isn't, so `userPlatform` is null for
 * most of them). Without it, filtering by 'UNKNOWN' in the UI would match
 * nothing while the rollups happily report a row for it.
 *
 * Bots are excluded to match the rollups. They are still stored in full.
 */
export const sessionWhere = (alias = "s"): string => `
  ${alias}."startedAt" >= ((:startDate)::date)::timestamp AT TIME ZONE 'Asia/Kolkata'
  AND ${alias}."startedAt" < ((:endDate)::date + 1)::timestamp AT TIME ZONE 'Asia/Kolkata'
  AND NOT ${alias}."isBot"
  AND (CAST(:userPlatform AS text) IS NULL OR COALESCE(${alias}."userPlatform", 'UNKNOWN') = :userPlatform)
  AND (CAST(:clientType AS text) IS NULL OR COALESCE(${alias}."clientType", 'UNKNOWN') = :clientType)
  AND (CAST(:os AS text) IS NULL OR COALESCE(${alias}."os", 'UNKNOWN') = :os)`;

/** As `sessionWhere`, for raw native_events on its own timestamp. */
export const eventWhere = (alias = "e"): string => `
  ${alias}."occurredAt" >= ((:startDate)::date)::timestamp AT TIME ZONE 'Asia/Kolkata'
  AND ${alias}."occurredAt" < ((:endDate)::date + 1)::timestamp AT TIME ZONE 'Asia/Kolkata'
  AND NOT ${alias}."isBot"
  AND (CAST(:userPlatform AS text) IS NULL OR COALESCE(${alias}."userPlatform", 'UNKNOWN') = :userPlatform)
  AND (CAST(:clientType AS text) IS NULL OR COALESCE(${alias}."clientType", 'UNKNOWN') = :clientType)
  AND (CAST(:os AS text) IS NULL OR COALESCE(${alias}."os", 'UNKNOWN') = :os)`;

/**
 * The window immediately before this one, of the same length — what every
 * "vs previous period" delta on the overview is measured against.
 *
 * Both ends are inclusive, so a 1-day window (start === end) has length 1 and
 * the previous window is the single day before. Computing this off the
 * requested range rather than a fixed "30 days ago" is what makes the deltas
 * still mean something when someone zooms into a single bad day.
 */
export const previousPeriod = (
  f: NativeFilters,
): { startDate: string; endDate: string } => {
  const start = new Date(`${f.startDate}T00:00:00Z`);
  const end = new Date(`${f.endDate}T00:00:00Z`);
  const days = Math.floor((end.getTime() - start.getTime()) / 86_400_000) + 1;

  const prevEnd = new Date(start.getTime() - 86_400_000);
  const prevStart = new Date(prevEnd.getTime() - (days - 1) * 86_400_000);

  return {
    startDate: prevStart.toISOString().slice(0, 10),
    endDate: prevEnd.toISOString().slice(0, 10),
  };
};

/**
 * Percentage change, rounded to one decimal.
 *
 * A jump from zero is reported as null rather than Infinity or an arbitrary
 * 100%: "no previous data" and "doubled" are different facts, and the UI needs
 * to be able to render the first as "—".
 */
export const delta = (current: number, previous: number): number | null => {
  if (previous === 0) return current === 0 ? 0 : null;
  return round1(((current - previous) / previous) * 100);
};

/** Safe division for per-session style ratios. */
export const per = (part: number, whole: number, decimals = 2): number => {
  if (whole <= 0) return 0;
  const factor = 10 ** decimals;
  return Math.round((part / whole) * factor) / factor;
};

/**
 * The dimension values actually present in the data, for populating the three
 * filter dropdowns.
 *
 * Read from the rollups rather than from the enums, so the UI only ever offers
 * a filter that will return something. An `os` list containing 'ChromeOS'
 * because the constant exists, when no ChromeOS session was ever recorded, is a
 * dead end for whoever clicks it.
 */
export const getFilterOptionsService = async (): Promise<{
  userPlatforms: string[];
  clientTypes: string[];
  operatingSystems: string[];
}> => {
  const rows = await q<{
    dimension: string;
    value: string;
  }>(`
    SELECT 'userPlatform' AS dimension, "userPlatform" AS value
      FROM native_analytics_daily GROUP BY 2
    UNION ALL
    SELECT 'clientType', "clientType" FROM native_analytics_daily GROUP BY 2
    UNION ALL
    SELECT 'os', "os" FROM native_analytics_daily GROUP BY 2
  `);

  const pick = (dimension: string): string[] =>
    rows
      .filter((r) => r.dimension === dimension && r.value)
      .map((r) => r.value)
      .sort((a, b) => a.localeCompare(b));

  return {
    userPlatforms: pick("userPlatform"),
    clientTypes: pick("clientType"),
    operatingSystems: pick("os"),
  };
};
