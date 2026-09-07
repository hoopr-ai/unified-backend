// ─── Drill-down ──────────────────────────────────────────────────────────────
//
// The rows behind any tile. One generic reader over the registry, so "clicking
// Downloads shows what was downloaded, by whom, when" is the same code path as
// clicking any other metric — and, more to the point, the same `where` string
// the tile was counted with. A drill-down written per metric is a drill-down
// that drifts from its own headline.
//
// ── WHAT IS INTERPOLATED, AND WHY THAT IS SAFE ─────────────────────────────
//
// The FROM chain, the column expressions and the ORDER BY all come from the
// registry — module constants, never request values. The three things a caller
// controls reach SQL as binds (`startDate`, `endDate`, `origin`, `search`) or
// as integers this file clamps itself (`page`, `limit`). `sort` is the one
// near-miss: it names a key, which is looked up in the metric's own `sorts`
// map. An unknown key falls back to the default rather than being pasted in.
//
// ── COUNT IS A SECOND STATEMENT, NOT A WINDOW FUNCTION ─────────────────────
//
// `count(*) OVER ()` on the same query looks tidier and costs the full row set
// on every page: the window is evaluated before the LIMIT. A separate COUNT
// over the same predicates lets Postgres stop at an index-only scan, and the
// two are issued concurrently, so the page costs the slower of the two rather
// than their sum.

import {
  q,
  num,
  inRange,
  rangeBinds,
  originWhere,
  creatorUsersCte,
  tablesExist,
  type CreatorFilters,
} from "./creator-analytics-shared";
import { METRICS, type MetricDef } from "./metrics.registry";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

/**
 * How many rows an export may carry.
 *
 * A cap, not a page: the CSV is meant for "give me the 4,000 downloads in this
 * window", which no paginated UI answers well. 50,000 is roughly two months of
 * platform-wide downloads at current volume and is bounded enough that one
 * click cannot pull a million rows through the API process.
 */
const MAX_EXPORT_ROWS = 50_000;

export interface DetailQuery extends CreatorFilters {
  metric: string;
  page?: number;
  limit?: number;
  sort?: string;
  direction?: "asc" | "desc";
  /** Free text over the creator's name, email and mobile. */
  search?: string;
  /** Restrict to one person — the link from a row back to their 360 page. */
  userId?: number;
  /** One bucket of a breakdown, e.g. `?dimension=assetType&value=stem`. */
  dimension?: string;
  value?: string;
}

/** Search over the person, which is the column every metric shares. */
const SEARCH_SQL = `(
  CAST(:search AS text) IS NULL
  OR cu.email ILIKE '%' || :search || '%'
  OR cu.mobile ILIKE '%' || :search || '%'
  OR (COALESCE(cu."firstName", '') || ' ' || COALESCE(cu."lastName", '')) ILIKE '%' || :search || '%'
  OR CAST(cu.id AS text) = :search
)`;

/**
 * The predicates and binds a drill-down shares between its page and its count.
 *
 * Returned together so the two statements cannot drift — the bug this shape
 * exists to prevent is a count that filters differently from the rows it
 * claims to be counting.
 */
const scopeOf = (m: MetricDef, f: DetailQuery) => {
  const defining = m.where ? `AND (${m.where})` : "";

  // A dimension bucket, when the reader arrived by clicking a breakdown row.
  // The dimension NAMES an expression in the registry; the value is bound.
  const dim = f.dimension ? m.dimensions?.[f.dimension] : undefined;
  const bucket = dim ? `AND ${dim.sql} = :dimensionValue` : "";

  const where = `${inRange(m.dateCol)}
      ${defining}
      ${bucket}
      AND ${originWhere("cu.origin")}
      AND ${SEARCH_SQL}
      AND (CAST(:userId AS bigint) IS NULL OR cu.id = :userId)`;

  const binds = {
    ...rangeBinds(f),
    search: f.search?.trim() ? f.search.trim() : null,
    userId: f.userId ?? null,
    dimensionValue: dim ? (f.value ?? "") : null,
  };

  return { where, binds };
};

/** `ORDER BY`, from the metric's whitelist. Never from the request string. */
const orderOf = (m: MetricDef, f: DetailQuery): string => {
  const key = f.sort && m.sorts[f.sort] ? f.sort : m.defaultSort;
  const direction = f.direction === "asc" ? "ASC" : "DESC";
  // NULLS LAST in both directions: a table sorted by "Paid" that opens with a
  // screen of blank cells looks broken, whichever way the arrow points.
  return `${m.sorts[key]} ${direction} NULLS LAST`;
};

const projection = (m: MetricDef): string =>
  m.columns.map((c) => `${c.sql} AS "${c.key}"`).join(",\n            ");

/**
 * Coerces the numeric columns to JS numbers.
 *
 * `pg` returns bigint and numeric as STRINGS — deliberately, since neither
 * fits a float64 in general — so a raw row hands the dashboard `"2"` for an
 * item count and `"50.00"` for a rupee amount. Left alone, every consumer has
 * to remember to parse: sorting a column client-side would order 9 after 10,
 * and a sum would concatenate. Coerced here, once, against the registry's own
 * declared types.
 *
 * A value that does not parse is passed through untouched rather than becoming
 * NaN — an id too large for a float64 is still more useful as its exact string
 * than as a rounded number.
 */
const NUMERIC_TYPES = new Set(["number", "money"]);

const coerce = (m: MetricDef, rows: Array<Record<string, unknown>>) => {
  const numeric = m.columns.filter((c) => NUMERIC_TYPES.has(c.type ?? "text"));
  if (!numeric.length) return rows;
  return rows.map((row) => {
    const out = { ...row };
    for (const c of numeric) {
      const v = out[c.key];
      if (v === null || v === undefined || typeof v === "number") continue;
      const n = Number(v);
      if (Number.isFinite(n)) out[c.key] = n;
    }
    return out;
  });
};

/**
 * GET /admin/creator-analytics/detail
 *
 * One page of the rows behind a metric.
 */
export const getDetailService = async (f: DetailQuery) => {
  const m = METRICS[f.metric];
  if (!m) throw new Error(`Unknown metric: ${f.metric}`);

  const present = await tablesExist(m.tables);
  const missing = m.tables.find((t) => !present[t]);
  if (missing) {
    return {
      metric: m.key,
      label: m.label,
      available: false,
      missingTable: missing,
      columns: m.columns.map((c) => ({ key: c.key, label: c.label, type: c.type ?? "text" })),
      items: [],
      total: 0,
      page: 1,
      limit: DEFAULT_LIMIT,
      totalPages: 0,
    };
  }

  const page = Math.max(1, Math.floor(f.page ?? 1));
  const limit = Math.min(MAX_LIMIT, Math.max(1, Math.floor(f.limit ?? DEFAULT_LIMIT)));
  const offset = (page - 1) * limit;

  const usersCte = await creatorUsersCte();
  const { where, binds } = scopeOf(m, f);

  const [rows, counted] = await Promise.all([
    q<Record<string, unknown>>(
      `WITH ${usersCte}
       SELECT ${projection(m)}
         FROM ${m.from}
        WHERE ${where}
        ORDER BY ${orderOf(m, f)}
        LIMIT :limit OFFSET :offset`,
      { ...binds, limit, offset },
    ),
    q<{ n: string; amount: string | null }>(
      `WITH ${usersCte}
       SELECT count(*)::bigint AS n,
              ${m.amountCol ? `COALESCE(sum(${m.amountCol}), 0)` : "NULL::numeric"} AS amount
         FROM ${m.from}
        WHERE ${where}`,
      binds,
    ),
  ]);

  const total = num(counted[0]?.n);

  return {
    metric: m.key,
    label: m.label,
    hint: m.hint,
    available: true,
    range: { startDate: f.startDate, endDate: f.endDate },
    origin: f.origin ?? null,
    columns: m.columns.map((c) => ({ key: c.key, label: c.label, type: c.type ?? "text" })),
    sorts: Object.keys(m.sorts),
    sort: f.sort && m.sorts[f.sort] ? f.sort : m.defaultSort,
    direction: f.direction === "asc" ? "asc" : "desc",
    /** Total money across the WHOLE filtered set, not just this page. */
    amountRupees: m.amountCol
      ? Math.round(num(counted[0]?.amount) * 100) / 100
      : null,
    items: coerce(m, rows),
    total,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  };
};

/** RFC-4180 escaping. A track name with a comma in it is not hypothetical. */
const csvCell = (v: unknown): string => {
  if (v === null || v === undefined) return "";
  const s = v instanceof Date ? v.toISOString() : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/**
 * GET /admin/creator-analytics/detail/export
 *
 * The same rows as a CSV, capped at MAX_EXPORT_ROWS.
 *
 * Built as one string rather than streamed: at the cap this is a few MB, which
 * is well inside what the response buffer handles, and a streamed CSV would
 * need its own error path for a query that fails after the headers are already
 * on the wire.
 */
export const getDetailExportService = async (
  f: DetailQuery,
): Promise<{ filename: string; csv: string; truncated: boolean }> => {
  const m = METRICS[f.metric];
  if (!m) throw new Error(`Unknown metric: ${f.metric}`);

  const present = await tablesExist(m.tables);
  const missing = m.tables.find((t) => !present[t]);
  if (missing) {
    return {
      filename: `${m.key}-unavailable.csv`,
      csv: `# ${m.label} is not recorded in this environment (missing table: ${missing})\n`,
      truncated: false,
    };
  }

  const usersCte = await creatorUsersCte();
  const { where, binds } = scopeOf(m, f);

  const rows = await q<Record<string, unknown>>(
    `WITH ${usersCte}
     SELECT ${projection(m)}
       FROM ${m.from}
      WHERE ${where}
      ORDER BY ${orderOf(m, f)}
      LIMIT :limit`,
    { ...binds, limit: MAX_EXPORT_ROWS + 1 },
  );

  const truncated = rows.length > MAX_EXPORT_ROWS;
  const body = truncated ? rows.slice(0, MAX_EXPORT_ROWS) : rows;

  const header = m.columns.map((c) => csvCell(c.label)).join(",");
  const lines = body.map((r) => m.columns.map((c) => csvCell(r[c.key])).join(","));

  return {
    filename: `creator-${m.key}-${f.startDate}-to-${f.endDate}.csv`,
    csv: [header, ...lines].join("\n") + "\n",
    truncated,
  };
};
