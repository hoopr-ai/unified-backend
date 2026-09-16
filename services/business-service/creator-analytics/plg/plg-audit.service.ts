// ─── PLG growth analytics — dictionary and data audit ────────────────────────
//
// What every metric means (read straight from the catalogue, so it cannot
// drift from the SQL), and whether the data behind it is actually arriving.

import { num, pct } from "../creator-analytics-shared";
import { plgQuery as q } from "./plg-db";
import {
  ACTIONS,
  KNOWN_GAPS,
  METRIC_DOCS,
  SEGMENTS,
  STAGES,
  SUB_FUNNELS,
} from "./plg-catalogue";
import { V2U_CTE, actsCte } from "./plg-sql";
import { PATH_TARGETS } from "./plg-people.service";
import { RETENTION_DAYS } from "./plg-insights.service";
import { memo } from "./plg-cache";

export const getPlgCatalogueService = () => ({
  stages: STAGES.map((s) => ({
    key: s.key,
    label: s.label,
    question: s.question,
    actions: s.actions,
    after: s.after ?? null,
  })),
  actions: ACTIONS.map((a) => ({
    key: a.key,
    label: a.label,
    category: a.category,
    surface: a.surface,
    definition: a.definition,
    source: a.source,
    identity: a.identity,
    coverageFrom: a.coverageFrom,
    caveat: a.caveat ?? null,
  })),
  subFunnels: SUB_FUNNELS.map((s) => ({
    key: s.key,
    group: s.group,
    label: s.label,
    question: s.question,
    steps: s.steps.map((st) => ({ label: st.label, actions: st.actions, laterDay: !!st.laterDay, repeat: !!st.repeat })),
    missing: s.missing ?? [],
  })),
  segments: SEGMENTS.map((s) => ({ key: s.key, label: s.label, note: s.note ?? null })),
  pathTargets: Object.entries(PATH_TARGETS).map(([key, v]) => ({ key, ...v })),
  retentionDays: RETENTION_DAYS,
  metrics: METRIC_DOCS,
  gaps: KNOWN_GAPS,
});

/**
 * Per action over the last `days` IST days: rows, people, how many are tied to
 * an account, and whether anything arrived in the last 24 hours. Slow (it reads
 * every source), so it is cached for half an hour.
 */
export const getPlgAuditService = async (days: number) => {
  const keys = ACTIONS.map((a) => a.key);
  const now = new Date();
  const from = new Date(now.getTime() - days * 86_400_000);
  const rows = await memo(`plg.audit:${days}`, 30 * 60_000, () =>
    q<Record<string, unknown>>(
      `WITH ${V2U_CTE},
${actsCte(keys)}
SELECT a,
       count(*) AS n,
       count(DISTINCT pk) AS people,
       count(DISTINCT pk) FILTER (WHERE uid IS NOT NULL) AS identified,
       count(*) FILTER (WHERE at >= now() - interval '24 hours') AS last24h,
       count(DISTINCT (at AT TIME ZONE 'Asia/Kolkata')::date) AS active_days,
       to_char(min(at) AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI') AS first_seen,
       to_char(max(at) AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI') AS last_seen,
       count(*) FILTER (WHERE d IS NULL) AS no_detail
  FROM acts
 GROUP BY a`,
      { actFrom: from.toISOString(), actTo: now.toISOString() },
    ),
  );

  return {
    days,
    checkedAt: now.toISOString(),
    actions: ACTIONS.map((a) => {
      const r = rows.find((x) => x.a === a.key) ?? {};
      const n = num(r.n);
      const last24h = num(r.last24h);
      const status =
        n === 0 ? "empty" : last24h === 0 ? "quiet" : "flowing";
      return {
        key: a.key,
        label: a.label,
        category: a.category,
        surface: a.surface,
        source: a.source,
        coverageFrom: a.coverageFrom,
        caveat: a.caveat ?? null,
        rows: n,
        people: num(r.people),
        identifiedShare: pct(num(r.identified), num(r.people)),
        last24h,
        activeDays: num(r.active_days),
        firstSeen: (r.first_seen as string) ?? null,
        lastSeen: (r.last_seen as string) ?? null,
        status,
      };
    }),
    gaps: KNOWN_GAPS,
    legend: {
      flowing: "Rows arrived in the last 24 hours.",
      quiet: "Data exists in the period but nothing in the last 24 hours — check before trusting today.",
      empty: "Nothing in the period. Either the source is new, or it has stopped.",
      identifiedShare: "Share of people tied to an account — the rest are anonymous browsers.",
    },
  };
};
