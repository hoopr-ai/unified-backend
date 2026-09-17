// ─── PLG growth analytics — the lifecycle funnel and its trend ──────────────
//
// Traffic → Activation → Sign up → Conversion intent → Subscription →
// Post-subscription activation, for a window, in either mode (see plg-sql.ts),
// against the same-length window before it, optionally split by a segment.

import { PAYMENT_KIND_EXPR, TX_SCOPE, num, pct, round1, delta } from "../creator-analytics-shared";
import { plgQuery } from "./plg-db";
import {
  ACTION_BY_KEY,
  SEGMENT_BY_KEY,
  STAGES,
  type StageSpec,
} from "./plg-catalogue";
import {
  PRESENCE,
  STAGE,
  STAGE_TIME,
  bucketSql,
  buildCore,
  coreBinds,
  cohortMaturity,
  inList,
  previousWindow,
  stageCounts,
  type Granularity,
  type PlgFilters,
} from "./plg-sql";
import { keyOf, memo, todayIst, ttlFor } from "./plg-cache";

/** Run the core plus a final SELECT, cached. */
export const runCore = <T>(
  name: string,
  f: PlgFilters,
  finalSelect: string,
  opts: { extraActions?: readonly string[]; binds?: Record<string, unknown> } = {},
): Promise<T[]> =>
  memo(
    keyOf(name, { ...f, extra: opts.extraActions ?? [], binds: opts.binds ?? {}, finalSelect }),
    ttlFor(f.endDate, todayIst()),
    () =>
      plgQuery<T>(`${buildCore(f, opts.extraActions)}\n${finalSelect}`, {
        ...coreBinds(f),
        ...(opts.binds ?? {}),
      }),
  );

// ── Batches ─────────────────────────────────────────────────────────────────

/** One final query to run over the shared core. */
export interface Part {
  key: string;
  /**
   * Optional leading CTEs (starting with ",", each `  name AS (` on its own
   * line with two-space indent), then a SELECT.
   */
  sql: string;
  extraActions?: readonly string[];
  binds?: Record<string, unknown>;
}

/**
 * Split a part into its CTE section and its final SELECT, renaming its CTEs so
 * several parts can share one WITH list. The core's own CTEs are untouched.
 */
const isolate = (part: Part, n: number): { ctes: string; select: string } => {
  const text = part.sql.replace(/^\s+/, "");
  if (!text.startsWith(",")) return { ctes: "", select: text };
  // The final SELECT is the first line that starts (at column 0) with SELECT.
  const at = text.search(/\nSELECT\b/);
  if (at < 0) throw new Error(`PLG part ${part.key} has no final SELECT`);
  let ctes = text.slice(0, at);
  let select = text.slice(at + 1);
  const names = [...ctes.matchAll(/\n {2}(\w+) AS (?:MATERIALIZED )?\(/g)].map((m) => m[1]);
  for (const name of names) {
    const re = new RegExp(`\\b${name}\\b`, "g");
    ctes = ctes.replace(re, `${name}_p${n}`);
    select = select.replace(re, `${name}_p${n}`);
  }
  return { ctes, select };
};

/**
 * Run several final queries over ONE evaluation of the core, as one statement.
 * Each part's rows come back as JSON, keyed by the part's key.
 */
export const runBatch = async (
  name: string,
  f: PlgFilters,
  parts: readonly Part[],
): Promise<Record<string, Record<string, unknown>[]>> => {
  const extra = [...new Set(parts.flatMap((p) => p.extraActions ?? []))];
  const binds = Object.assign({}, ...parts.map((p) => p.binds ?? {}));
  const iso = parts.map((p, i) => isolate(p, i));
  const sql = `${iso.map((x) => x.ctes).join("")}
SELECT ${iso
    .map((x, i) => `(SELECT COALESCE(json_agg(t), '[]'::json) FROM (${x.select}) t) AS "p${i}"`)
    .join(",\n       ")}`;
  const [row] = await runCore<Record<string, unknown>>(name, f, sql, { extraActions: extra, binds });
  const out: Record<string, Record<string, unknown>[]> = {};
  parts.forEach((p, i) => {
    const v = row?.[`p${i}`];
    out[p.key] = (typeof v === "string" ? JSON.parse(v) : v ?? []) as Record<string, unknown>[];
  });
  return out;
};

// ── Coverage ────────────────────────────────────────────────────────────────

export interface StageCoverage {
  /** Every action of the stage has data for the whole window. */
  complete: boolean;
  /** No action of the stage has data anywhere in the window. */
  unavailable: boolean;
  note: string | null;
}

/**
 * Which rungs are only partly instrumented for this window. A rung whose web
 * events began mid-window reads LOW for reasons that have nothing to do with
 * behaviour, and the reader has to be told before comparing it.
 */
export const stageCoverage = (stage: StageSpec, f: PlgFilters): StageCoverage => {
  const late = stage.actions
    .map((k) => ACTION_BY_KEY[k])
    .filter((a) => a && a.coverageFrom > f.startDate);
  const unavailable = late.length === stage.actions.length && late.every((a) => a.coverageFrom > f.endDate);
  if (late.length === 0) return { complete: true, unavailable: false, note: null };
  const parts = late.map((a) => `${a.label} from ${a.coverageFrom}`);
  return {
    complete: false,
    unavailable,
    note: `Partly instrumented in this window — ${parts.join("; ")}. Earlier days count only the other signals, so this rung reads low there.`,
  };
};

// ── The funnel ──────────────────────────────────────────────────────────────

type CountRow = Record<string, string | number | null>;

const RAW_COUNTS = STAGES.map(
  (s) => `count(*) FILTER (WHERE reach.${STAGE_TIME[s.key]} IS NOT NULL) AS "r_${s.key}"`,
).join(",\n       ");

/**
 * Median hours to reach each rung, among the people who reached it — from
 * first appearance, and for post-subscription activation from the subscription.
 * Only meaningful in cohort mode, where there is a start to measure from.
 */
const MEDIANS = STAGES.filter((s) => s.key !== "traffic")
  .map((s) => {
    const from = s.key === "post_sub" ? "reach.t_subscription" : "reach.t_traffic";
    return `percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM reach.${STAGE_TIME[s.key]} - ${from})) AS "m_${s.key}"`;
  })
  .join(",\n       ");

const FUNNEL_SELECT = (mode: PlgFilters["mode"]) => `
SELECT count(*) AS n,
       ${stageCounts(mode)},
       ${RAW_COUNTS},
       ${MEDIANS}
  FROM reach`;

export interface PlgStage {
  key: string;
  label: string;
  question: string;
  /** People on this rung (nested in cohort mode). */
  people: number;
  /** People who reached this rung at all, whether or not they reached the rungs above. */
  reachedAny: number;
  previousPeople: number;
  deltaPct: number | null;
  /** % of the previous rung. In activity mode a ratio, not a conversion. */
  fromPrevious: number | null;
  /** % of traffic. */
  fromTraffic: number | null;
  dropOff: number | null;
  dropOffPct: number | null;
  /** Median hours from first appearance (from subscription for post-subscription). Cohort mode only. */
  medianHours: number | null;
  coverage: StageCoverage;
}

const shape = (f: PlgFilters, cur: CountRow, prev: CountRow): PlgStage[] =>
  STAGES.map((s, i) => {
    const people = num(cur[`s_${s.key}`]);
    const above = i === 0 ? null : num(cur[`s_${STAGES[i - 1].key}`]);
    const top = num(cur.s_traffic);
    const median = cur[`m_${s.key}`];
    const previousPeople = num(prev[`s_${s.key}`]);
    return {
      key: s.key,
      label: s.label,
      question: s.question,
      people,
      reachedAny: num(cur[`r_${s.key}`]),
      previousPeople,
      deltaPct: delta(people, previousPeople),
      // In activity mode the post-subscription rung counts EVERY subscriber
      // active in the window, not the few who subscribed in it, so a ratio
      // to the rung above would read in the thousands of percent.
      fromPrevious:
        above === null || (f.mode === "activity" && s.after)
          ? null
          : above > 0
            ? pct(people, above)
            : null,
      fromTraffic: i === 0 ? null : top > 0 ? pct(people, top) : null,
      dropOff: above === null ? null : f.mode === "cohort" ? Math.max(0, above - people) : null,
      dropOffPct:
        above === null || f.mode !== "cohort" || above === 0 ? null : pct(Math.max(0, above - people), above),
      medianHours:
        f.mode === "cohort" && median !== null && median !== undefined ? round1(Number(median) / 3600) : null,
      coverage: stageCoverage(s, f),
    };
  });

export const MODE_NOTES = {
  cohort:
    "Cohort: people whose first-ever appearance falls in the window, followed for the conversion window. " +
    "Each rung counts people who also reached every rung above it, so the rates are true conversion rates. " +
    "Anyone seen before the window is left out even if they subscribed in it — the totals under the funnel count everyone.",
  activity:
    "Activity: everyone active in the window and what they did in it. Rungs are NOT nested — a subscriber " +
    "downloading today did not sign up today — so the percentages between rungs are ratios, not conversion rates.",
};

export interface CompareGroup {
  value: string;
  people: number;
  stages: Record<string, number>;
  rates: Record<string, number | null>;
}

const comparePart = (f: PlgFilters, dimension: string): Part => {
  const seg = SEGMENT_BY_KEY[dimension];
  if (!seg) throw new Error(`Unknown PLG segment: ${dimension}`);
  return {
    key: "compare",
    sql: `
SELECT ${seg.sql}::text AS value, count(*) AS n,
       ${stageCounts(f.mode)}
  FROM reach JOIN pop pp USING (pk)
 GROUP BY 1
 ORDER BY 2 DESC`,
  };
};

const compareGroups = (rows: CountRow[]): CompareGroup[] => {

  const toGroup = (value: string, r: CountRow): CompareGroup => {
    const stages: Record<string, number> = {};
    const rates: Record<string, number | null> = {};
    STAGES.forEach((s, i) => {
      stages[s.key] = num(r[`s_${s.key}`]);
      const base = i === 0 ? null : num(r[`s_${STAGES[i - 1].key}`]);
      rates[s.key] = base === null ? null : base > 0 ? pct(stages[s.key], base) : null;
    });
    return { value, people: num(r.n), stages, rates };
  };

  // The eight biggest groups by name, the rest folded into one row so the
  // table stays readable and the totals still add up.
  const top = rows.slice(0, 8).map((r) => toGroup((r.value as string) ?? "(none)", r));
  const rest = rows.slice(8);
  if (rest.length > 0) {
    const sum: CountRow = { n: 0 };
    for (const r of rest) {
      sum.n = num(sum.n) + num(r.n);
      for (const s of STAGES) sum[`s_${s.key}`] = num(sum[`s_${s.key}`]) + num(r[`s_${s.key}`]);
    }
    top.push(toGroup(`Other (${rest.length})`, sum));
  }
  return top;
};

// ── Everyone in the window ──────────────────────────────────────────────────
//
// The journey funnel follows only people FIRST SEEN in the window, so its
// Subscription rung is a fraction of the subscriptions actually started (a
// week read 13 on the web against 40 overall, most of the rest being creators
// who had visited before). These totals put the whole book beside the funnel:
// every activated subscription started in the window and every subscription
// payment that arrived — any person, any surface, no segment — with payments
// split by the Subscriptions CMS's own cycle rule.

const WINDOW_TOTALS_SQL = `
WITH subs AS (
  SELECT us."userId", COALESCE(us."paymentProvider", 'unknown') AS provider
    FROM user_subscriptions us
    JOIN users u ON u.id = us."userId" AND u.platform = 'CREATOR'
   WHERE us."currentPeriodStart" IS NOT NULL AND us."legacyPlanId" IS NULL
     AND us."createdAt" >= :winStart AND us."createdAt" < :winEnd
),
pays AS (
  SELECT t."userId", t."totalAmount", ${PAYMENT_KIND_EXPR} AS kind
    FROM transactions t
    JOIN users u ON u.id = t."userId" AND u.platform = 'CREATOR'
   WHERE ${TX_SCOPE} AND t."createdAt" >= :winStart AND t."createdAt" < :winEnd
)
SELECT (SELECT count(DISTINCT "userId") FROM subs) AS sub_people,
       (SELECT count(*) FROM subs) AS sub_rows,
       (SELECT json_object_agg(provider, people) FROM (
          SELECT provider, count(DISTINCT "userId") AS people FROM subs GROUP BY 1
        ) x) AS sub_by_provider,
       count(*) AS pay_n,
       count(DISTINCT "userId") AS pay_people,
       COALESCE(sum("totalAmount"), 0) AS pay_rupees,
       count(*) FILTER (WHERE kind = 'first') AS first_n,
       count(*) FILTER (WHERE kind = 'renewal') AS renewal_n,
       count(*) FILTER (WHERE kind = 'unclassified') AS unknown_n
  FROM pays`;

const windowTotals = (f: PlgFilters) => {
  const { winStart, winEnd } = coreBinds(f);
  return memo(keyOf("plg.totals", { winStart, winEnd }), ttlFor(f.endDate, todayIst()), async () => {
    const [r = {}] = await plgQuery<Record<string, unknown>>(WINDOW_TOTALS_SQL, { winStart, winEnd });
    const byProvider = (r.sub_by_provider ?? {}) as Record<string, unknown>;
    return {
      subscriptionsStarted: {
        people: num(r.sub_people),
        subscriptions: num(r.sub_rows),
        byProvider: Object.fromEntries(Object.entries(byProvider).map(([k, v]) => [k, num(v)])),
      },
      payments: {
        count: num(r.pay_n),
        people: num(r.pay_people),
        rupees: Math.round(num(r.pay_rupees)),
        first: num(r.first_n),
        renewal: num(r.renewal_n),
        cycleUnknown: num(r.unknown_n),
      },
      note:
        "Everyone, on every surface, whatever the mode, surface or segment above. A subscription counts " +
        "when its first billing period started (checkouts never paid are excluded), timed at checkout. " +
        "Payments are subscription money that arrived; 'cycle unknown' means the payment was saved " +
        "without its cycle number, so it cannot be called a renewal or a first payment.",
    };
  });
};

export const getPlgFunnelService = async (f: PlgFilters, compare?: string | null) => {
  const prev = previousWindow(f);
  const parts: Part[] = [{ key: "funnel", sql: FUNNEL_SELECT(f.mode) }];
  if (compare) parts.push(comparePart(f, compare));
  const [batch, prevBatch, totals] = await Promise.all([
    runBatch("plg.funnel", f, parts),
    runBatch("plg.funnel", prev, [{ key: "funnel", sql: FUNNEL_SELECT(prev.mode) }]),
    windowTotals(f),
  ]);
  const cur = batch.funnel[0] as CountRow | undefined;
  const before = prevBatch.funnel[0] as CountRow | undefined;
  const groups = compare ? compareGroups(batch.compare as CountRow[]) : null;

  return {
    range: { startDate: f.startDate, endDate: f.endDate },
    previousRange: {
      startDate: prev.startDate,
      endDate: prev.endDate,
      // Set when the previous window was cut to the same point in the day.
      until: prev.endAt ?? null,
    },
    mode: f.mode,
    modeNote: MODE_NOTES[f.mode],
    horizonDays: f.mode === "cohort" ? f.horizonDays : null,
    surface: f.surface,
    segment: f.segment ? { key: f.segment, label: SEGMENT_BY_KEY[f.segment]?.label ?? f.segment, value: f.segmentValue } : null,
    maturity: cohortMaturity(f),
    people: num(cur?.n),
    stages: shape(f, cur ?? {}, before ?? {}),
    compare: groups
      ? { dimension: compare, label: SEGMENT_BY_KEY[compare as string]?.label ?? compare, groups }
      : null,
    windowTotals: totals,
  };
};

// ── The trend ───────────────────────────────────────────────────────────────

const ACTIVITY_TREND_SELECT = (g: Granularity) => {
  const stageIn = (k: string) => inList(STAGE(k).actions);
  return `
SELECT ${bucketSql("x.at", g)} AS bucket,
       count(DISTINCT x.pk) FILTER (WHERE x.a IN (${inList(PRESENCE)})) AS "s_traffic",
       count(DISTINCT x.pk) FILTER (WHERE x.a IN (${stageIn("activation")})) AS "s_activation",
       count(DISTINCT x.pk) FILTER (WHERE x.a IN (${stageIn("signup")})) AS "s_signup",
       count(DISTINCT x.pk) FILTER (WHERE x.a IN (${stageIn("intent")})) AS "s_intent",
       count(DISTINCT x.pk) FILTER (WHERE x.a IN (${stageIn("subscription")})) AS "s_subscription",
       count(DISTINCT x.pk) FILTER (WHERE x.a IN (${stageIn("post_sub")})
                                      AND pp.paid_since IS NOT NULL AND x.at >= pp.paid_since) AS "s_post_sub"
  FROM acts x
  JOIN pop pp ON pp.pk = x.pk
 WHERE x.at >= :winStart AND x.at < :winEnd
 GROUP BY 1
 ORDER BY 1`;
};

const COHORT_TREND_SELECT = (g: Granularity, mode: PlgFilters["mode"]) => `
SELECT ${bucketSql("pp.first_seen", g)} AS bucket,
       ${stageCounts(mode)}
  FROM reach JOIN pop pp USING (pk)
 GROUP BY 1
 ORDER BY 1`;

export const getPlgTrendService = async (f: PlgFilters, g: Granularity) => {
  const rows = await runCore<CountRow & { bucket: string }>(
    "plg.trend",
    f,
    f.mode === "cohort" ? COHORT_TREND_SELECT(g, f.mode) : ACTIVITY_TREND_SELECT(g),
  );
  const now = Date.now();
  return {
    mode: f.mode,
    granularity: g,
    stages: STAGES.map((s) => ({ key: s.key, label: s.label })),
    points: rows.map((r) => {
      const stages: Record<string, number> = {};
      for (const s of STAGES) stages[s.key] = num(r[`s_${s.key}`]);
      // A cohort bucket is mature once its LAST possible member has had the
      // full horizon; before that its later rungs are still filling.
      const bucketStart = Date.parse(`${r.bucket}T00:00:00+05:30`);
      const span = g === "day" ? 1 : g === "week" ? 7 : 31;
      const mature =
        f.mode !== "cohort" || bucketStart + (span + f.horizonDays) * 86_400_000 <= now;
      return { bucket: r.bucket, stages, mature };
    }),
  };
};
