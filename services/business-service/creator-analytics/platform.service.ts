// ─── Platform activity ───────────────────────────────────────────────────────
//
// Every metric in the registry, counted over the window, against the preceding
// window of equal length, and split by derived origin — driven entirely by the
// registry so adding a metric is one entry there and nothing here.
//
// ── ONE SCAN PER METRIC, NOT TWO ────────────────────────────────────────────
//
// The current window and the comparison window are read in a SINGLE statement,
// as FILTER clauses over a range spanning both. Twelve metrics × two windows is
// twenty-four round trips done the obvious way; this is twelve, each touching
// its table once. On tables with no index on the date column — `licenses`,
// `user_liked_tracks` and `video_links` all lack one — that difference is the
// whole cost of the endpoint, because each pass is a sequential scan.
//
// ── A METRIC AN ENVIRONMENT CANNOT ANSWER IS REPORTED, NOT THROWN ───────────
//
// The registry names every table an entry touches. A missing one (staging lacks
// several) marks that metric `available: false` with the table that is absent,
// and the rest of the dashboard renders. A tile reading "not recorded here"
// beats a 500 that takes the other eleven down with it.

import {
  q,
  num,
  pct,
  delta,
  inRange,
  rangeBinds,
  originWhere,
  cteFor,
  tablesExist,
  captureStart,
  ORIGIN_LABELS,
  ORIGINS,
  ORIGIN_NOTE,
  REVENUE_NOTE,
  RENEWAL_NOTE,
  SESSION_NOTE,
  type CreatorFilters,
} from "./creator-analytics-shared";
import {
  METRICS,
  METRIC_ORDER,
  ALL_METRIC_TABLES,
  isUserScoped,
  type MetricDef,
} from "./metrics.registry";

const round2 = (v: unknown): number => Math.round(num(v) * 100) / 100;

/** The comparison window: the same number of days, immediately before. */
const comparisonWindow = (f: CreatorFilters) => {
  const start = new Date(`${f.startDate}T00:00:00Z`);
  const end = new Date(`${f.endDate}T00:00:00Z`);
  const days = Math.floor((end.getTime() - start.getTime()) / 86_400_000) + 1;
  const prevEnd = new Date(start.getTime() - 86_400_000);
  const prevStart = new Date(prevEnd.getTime() - (days - 1) * 86_400_000);
  return {
    prevStartDate: prevStart.toISOString().slice(0, 10),
    prevEndDate: prevEnd.toISOString().slice(0, 10),
  };
};

export interface MetricSummary {
  key: string;
  label: string;
  group: MetricDef["group"];
  hint: string;
  /** False for catalogue rows, which have no owner and so no origin split. */
  userScoped: boolean;
  available: boolean;
  /** Which table is missing, when `available` is false. */
  missingTable?: string;
  count: number;
  uniqueUsers: number;
  amountRupees: number | null;
  amountLabel: string | null;
  previousCount: number;
  deltaPct: number | null;
  previousAmountRupees: number | null;
  amountDeltaPct: number | null;
  /** Counts per derived origin, in dashboard order. */
  byOrigin: Array<{ origin: string; label: string; count: number; sharePct: number }>;
  /** Dimensions this metric can be broken down by. */
  dimensions: Array<{ key: string; label: string }>;
}

/**
 * One metric's numbers.
 *
 * Both windows come back in one row. The predicates are the metric's own
 * `where` (which DEFINES it) plus the bound origin filter; nothing from the
 * request is ever interpolated.
 */
const summarise = async (m: MetricDef, f: CreatorFilters): Promise<MetricSummary> => {
  const { prevStartDate, prevEndDate } = comparisonWindow(f);
  const defining = m.where ? `AND (${m.where})` : "";
  const userScoped = isUserScoped(m);
  const cte = await cteFor(m);

  // Dropped entirely for a catalogue metric rather than written as an
  // always-true predicate: `cu` is not in its FROM at all.
  const originClause = userScoped ? `AND ${originWhere("cu.origin")}` : "";

  const curr = `(${inRange(m.dateCol)})`;
  const prev = `(${m.dateCol} >= ((:prevStartDate)::date)::timestamp AT TIME ZONE 'Asia/Kolkata'
                 AND ${m.dateCol} < ((:prevEndDate)::date + 1)::timestamp AT TIME ZONE 'Asia/Kolkata')`;

  const amount = m.amountCol
    ? `COALESCE(sum(${m.amountCol}) FILTER (WHERE ${curr}), 0)  AS amount,
       COALESCE(sum(${m.amountCol}) FILTER (WHERE ${prev}), 0)  AS prev_amount,`
    : `NULL::numeric AS amount, NULL::numeric AS prev_amount,`;

  const [totals, origins] = await Promise.all([
    q<Record<string, string>>(
      `${cte}
       SELECT count(*) FILTER (WHERE ${curr})::bigint                       AS n,
              count(DISTINCT ${m.userCol}) FILTER (WHERE ${curr})::bigint   AS users,
              ${amount}
              count(*) FILTER (WHERE ${prev})::bigint                       AS prev_n
         FROM ${m.from}
        WHERE (${curr} OR ${prev})
          ${defining}
          ${originClause}`,
      { ...rangeBinds(f), prevStartDate, prevEndDate },
    ),
    userScoped
      ? q<{ origin: string; n: string }>(
          `${cte}
           SELECT cu.origin, count(*)::bigint AS n
             FROM ${m.from}
            WHERE ${curr}
              ${defining}
              ${originClause}
            GROUP BY cu.origin`,
          rangeBinds(f),
        )
      : Promise.resolve<Array<{ origin: string; n: string }>>([]),
  ]);

  const r = totals[0] ?? {};
  const count = num(r.n);
  const prevCount = num(r.prev_n);
  const amountRupees = m.amountCol ? round2(r.amount) : null;
  const prevAmount = m.amountCol ? round2(r.prev_amount) : null;

  const byOriginCounts = new Map(origins.map((o) => [o.origin, num(o.n)]));

  return {
    key: m.key,
    label: m.label,
    group: m.group,
    hint: m.hint,
    userScoped,
    available: true,
    count,
    uniqueUsers: num(r.users),
    amountRupees,
    amountLabel: m.amountLabel ?? null,
    previousCount: prevCount,
    deltaPct: delta(count, prevCount),
    previousAmountRupees: prevAmount,
    amountDeltaPct:
      amountRupees !== null && prevAmount !== null ? delta(amountRupees, prevAmount) : null,
    // Every origin is listed even at zero, so the four bars keep their
    // positions between metrics and a zero reads as "none" rather than as a
    // bucket that silently vanished.
    byOrigin: ORIGINS.map((o) => ({
      origin: o,
      label: ORIGIN_LABELS[o],
      count: byOriginCounts.get(o) ?? 0,
      sharePct: pct(byOriginCounts.get(o) ?? 0, count),
    })),
    dimensions: Object.entries(m.dimensions ?? {}).map(([key, d]) => ({
      key,
      label: d.label,
    })),
  };
};

const unavailable = (m: MetricDef, missingTable: string): MetricSummary => ({
  key: m.key,
  label: m.label,
  group: m.group,
  hint: m.hint,
  userScoped: isUserScoped(m),
  available: false,
  missingTable,
  count: 0,
  uniqueUsers: 0,
  amountRupees: null,
  amountLabel: m.amountLabel ?? null,
  previousCount: 0,
  deltaPct: null,
  previousAmountRupees: null,
  amountDeltaPct: null,
  byOrigin: ORIGINS.map((o) => ({
    origin: o,
    label: ORIGIN_LABELS[o],
    count: 0,
    sharePct: 0,
  })),
  dimensions: [],
});

/**
 * GET /admin/creator-analytics/platform
 *
 * Every tile on the Activity view.
 */
export const getPlatformService = async (f: CreatorFilters) => {
  const [present, coverage] = await Promise.all([
    tablesExist(ALL_METRIC_TABLES),
    captureStart(),
  ]);

  const metrics = await Promise.all(
    METRIC_ORDER.map(async (key) => {
      const m = METRICS[key];
      const missing = m.tables.find((t) => !present[t]);
      if (missing) return unavailable(m, missing);
      return summarise(m, f);
    }),
  );

  const { prevStartDate, prevEndDate } = comparisonWindow(f);

  return {
    range: { startDate: f.startDate, endDate: f.endDate },
    previousRange: { startDate: prevStartDate, endDate: prevEndDate },
    origin: f.origin ?? null,
    metrics,
    origins: ORIGINS.map((o) => ({ key: o, label: ORIGIN_LABELS[o] })),
    coverage: {
      sessionsFrom: coverage,
      windowPredatesCapture: Boolean(coverage && f.startDate < coverage),
    },
    notes: {
      origin: ORIGIN_NOTE,
      revenue: REVENUE_NOTE,
      renewals: RENEWAL_NOTE,
      sessions: SESSION_NOTE,
    },
  };
};

/**
 * GET /admin/creator-analytics/breakdown
 *
 * One metric grouped by one of its declared dimensions — "downloads by asset
 * type", "claims by status", "signups by state".
 *
 * `dimension` is the only request value in this module that reaches SQL as
 * structure rather than as a bind, and it is looked up in the registry's fixed
 * map, never interpolated. The Joi schema checks it too; two locks on the same
 * door, because this is the door.
 */
export const getBreakdownService = async (
  f: CreatorFilters & { metric: string; dimension?: string; limit?: number },
) => {
  const m = METRICS[f.metric];
  if (!m) throw new Error(`Unknown metric: ${f.metric}`);

  const present = await tablesExist(m.tables);
  const missing = m.tables.find((t) => !present[t]);
  if (missing) {
    return {
      metric: m.key,
      label: m.label,
      dimension: null,
      available: false,
      missingTable: missing,
      truncated: false,
      rows: [],
    };
  }

  const dims = m.dimensions ?? {};
  const key = f.dimension && dims[f.dimension] ? f.dimension : Object.keys(dims)[0];
  const dim = dims[key];
  if (!dim) {
    return {
      metric: m.key,
      label: m.label,
      dimension: null,
      available: true,
      truncated: false,
      rows: [],
    };
  }

  const cte = await cteFor(m);
  const defining = m.where ? `AND (${m.where})` : "";
  const originClause = isUserScoped(m) ? `AND ${originWhere("cu.origin")}` : "";
  const amount = m.amountCol
    ? `COALESCE(sum(${m.amountCol}), 0) AS amount`
    : `NULL::numeric AS amount`;
  const limit = Math.min(200, Math.max(1, f.limit ?? 50));

  const rows = await q<Record<string, string>>(
    `${cte}
     SELECT ${dim.sql} AS bucket,
            count(*)::bigint AS n,
            count(DISTINCT ${m.userCol})::bigint AS users,
            ${amount}
       FROM ${m.from}
      WHERE ${inRange(m.dateCol)}
        ${defining}
        ${originClause}
      GROUP BY 1
      ORDER BY n DESC
      LIMIT ${limit}`,
    rangeBinds(f),
  );

  const total = rows.reduce((sum, r) => sum + num(r.n), 0);

  return {
    metric: m.key,
    label: m.label,
    dimension: { key, label: dim.label },
    available: true,
    // The share is of what came back, not of the metric's true total: the LIMIT
    // above can cut a long tail, and calling the visible slice 100% would be a
    // lie. `truncated` says when that happened.
    truncated: rows.length >= limit,
    rows: rows.map((r) => ({
      bucket: r.bucket === null ? "(none)" : String(r.bucket),
      count: num(r.n),
      uniqueUsers: num(r.users),
      amountRupees: m.amountCol ? round2(r.amount) : null,
      sharePct: pct(num(r.n), total),
    })),
  };
};

/**
 * GET /admin/creator-analytics/meta
 *
 * The metric catalogue, so the dashboard can render tiles, drill-down columns
 * and sort options without hardcoding a copy of the registry that drifts.
 */
export const getMetaService = async () => {
  const present = await tablesExist(ALL_METRIC_TABLES);

  return {
    origins: ORIGINS.map((o) => ({ key: o, label: ORIGIN_LABELS[o] })),
    metrics: METRIC_ORDER.map((key) => {
      const m = METRICS[key];
      const missing = m.tables.find((t) => !present[t]);
      return {
        key: m.key,
        label: m.label,
        group: m.group,
        hint: m.hint,
        available: !missing,
        missingTable: missing ?? null,
        userScoped: isUserScoped(m),
        hasAmount: Boolean(m.amountCol),
        amountLabel: m.amountLabel ?? null,
        defaultSort: m.defaultSort,
        sorts: Object.keys(m.sorts),
        columns: m.columns.map((c) => ({
          key: c.key,
          label: c.label,
          type: c.type ?? "text",
        })),
        dimensions: Object.entries(m.dimensions ?? {}).map(([k, d]) => ({
          key: k,
          label: d.label,
        })),
      };
    }),
    notes: {
      origin: ORIGIN_NOTE,
      revenue: REVENUE_NOTE,
      renewals: RENEWAL_NOTE,
      sessions: SESSION_NOTE,
    },
  };
};
