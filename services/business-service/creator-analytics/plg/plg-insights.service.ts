// ─── PLG growth analytics — insights and retention ───────────────────────────
//
// Insights are STATEMENTS OF FACT with their numbers attached: a rate moved, a
// rung loses the most people, a path is the most common one, a segment
// converts differently. They never say why. A change in a rate is reported only
// when it clears a two-proportion z-test at ~95% with enough people on both
// sides, so the list is not a stream of noise from small days.
//
// Retention compares subscribers who got value early with those who did not.
// That is a correlation — the payload says so, every time.

import { num, pct, round1 } from "../creator-analytics-shared";
import { plgQuery as q } from "./plg-db";
import { ACTION_BY_KEY } from "./plg-catalogue";
import {
  V2U_CTE,
  actsCte,
  addDays,
  istMidnight,
  inList,
  type PlgFilters,
} from "./plg-sql";
import { getPlgFunnelService, stageCoverage } from "./plg-funnel.service";
import { STAGES } from "./plg-catalogue";
import { previousWindow } from "./plg-sql";
import { getPlgPathsService } from "./plg-people.service";
import { keyOf, memo, todayIst, ttlFor } from "./plg-cache";

// ── Statistics ──────────────────────────────────────────────────────────────

/** Two-proportion z statistic; 0 when it cannot be computed. */
export const zTest = (x1: number, n1: number, x2: number, n2: number): number => {
  if (n1 <= 0 || n2 <= 0) return 0;
  const p = (x1 + x2) / (n1 + n2);
  const se = Math.sqrt(p * (1 - p) * (1 / n1 + 1 / n2));
  return se > 0 ? (x1 / n1 - x2 / n2) / se : 0;
};

/** Two-sided confidence that the difference is real, from |z| (normal approximation). */
const confidence = (z: number): number => {
  // Abramowitz–Stegun erf approximation.
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const erf =
    1 -
    (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-x * x);
  return round1(erf * 100);
};

const MIN_BASE = 30;
const Z_CUTOFF = 1.96;

export interface Insight {
  id: string;
  kind: "change" | "dropoff" | "volume" | "path" | "segment" | "retention" | "data";
  severity: "high" | "medium" | "info";
  title: string;
  detail: string;
  evidence: Record<string, number | string | null>;
  confidence?: number | null;
  /** Where to click to see the people behind it. */
  drill?: { stage?: string; dropped?: boolean; segment?: string; segmentValue?: string; path?: string };
}

// ── Insights ────────────────────────────────────────────────────────────────

const fmt = (n: number) => n.toLocaleString("en-IN");

export const getPlgInsightsService = async (f: PlgFilters) => {
  const [funnel, subPaths, abandonPaths, byChannel] = await Promise.all([
    getPlgFunnelService(f),
    getPlgPathsService(f, "subscribed", 3).catch(() => null),
    getPlgPathsService(f, "checkout_abandoned", 3).catch(() => null),
    getPlgFunnelService(f, "channel").catch(() => null),
  ]);
  const out: Insight[] = [];
  const stages = funnel.stages;
  const ratioWord = f.mode === "cohort" ? "conversion" : "ratio";

  // A rung whose instrumentation began inside either window moves for reasons
  // that are not behaviour. No change or volume insight is drawn from it.
  const prev = previousWindow(f);
  const prevLabel = funnel.previousRange.until
    ? `the same hours of ${funnel.previousRange.startDate}${
        funnel.previousRange.startDate === funnel.previousRange.endDate ? "" : ` – ${funnel.previousRange.endDate}`
      }`
    : `${funnel.previousRange.startDate} – ${funnel.previousRange.endDate}`;
  const measuredBoth = (key: string) => {
    const spec = STAGES.find((x) => x.key === key);
    return !!spec && stageCoverage(spec, f).complete && stageCoverage(spec, prev).complete;
  };

  // Data first: a rung that is only partly instrumented, or a cohort that is
  // still filling, changes how every other insight should be read.
  for (const s of stages) {
    if (!s.coverage.complete) {
      out.push({
        id: `coverage-${s.key}`,
        kind: "data",
        severity: "info",
        title: `${s.label} is only partly measured in this window`,
        detail: s.coverage.note ?? "",
        evidence: { stage: s.label },
      });
    }
  }
  if (!funnel.maturity.mature) {
    out.push({
      id: "maturity",
      kind: "data",
      severity: "info",
      title: "This cohort is still converting",
      detail: `People in this window have not all had the full ${f.horizonDays}-day conversion window yet (complete on ${funnel.maturity.matureAt.slice(0, 10)}). Later rungs will still grow; compare with a mature cohort with care.`,
      evidence: { matureAt: funnel.maturity.matureAt.slice(0, 10) },
    });
  }

  // Stage-to-stage rates that moved significantly against the previous period.
  stages.forEach((s, i) => {
    if (i === 0) return;
    const above = stages[i - 1];
    const x1 = s.people;
    const n1 = above.people;
    const x2 = s.previousPeople;
    const n2 = above.previousPeople;
    if (n1 < MIN_BASE || n2 < MIN_BASE) return;
    if (!measuredBoth(s.key) || !measuredBoth(above.key)) return;
    const z = zTest(x1, n1, x2, n2);
    if (Math.abs(z) < Z_CUTOFF) return;
    const r1 = pct(x1, n1);
    const r2 = pct(x2, n2);
    out.push({
      id: `rate-${s.key}`,
      kind: "change",
      severity: Math.abs(z) >= 3 ? "high" : "medium",
      title: `${above.label} → ${s.label} ${ratioWord} ${r1 > r2 ? "rose" : "fell"} from ${r2}% to ${r1}%`,
      detail: `${fmt(x1)} of ${fmt(n1)} this period against ${fmt(x2)} of ${fmt(n2)} in ${prevLabel}.`,
      evidence: { current: r1, previous: r2, currentNumerator: x1, currentDenominator: n1, previousNumerator: x2, previousDenominator: n2, z: round1(z) },
      confidence: confidence(z),
      drill: { stage: s.key },
    });
  });

  // Volume changes, as Poisson counts (a ±20% move on a few dozen people is noise).
  for (const s of stages) {
    const c = s.people;
    const p = s.previousPeople;
    if (c + p < 60 || s.deltaPct === null || Math.abs(s.deltaPct) < 20) continue;
    if (!measuredBoth(s.key)) continue;
    const z = (c - p) / Math.sqrt(c + p);
    if (Math.abs(z) < Z_CUTOFF) continue;
    out.push({
      id: `volume-${s.key}`,
      kind: "volume",
      severity: Math.abs(s.deltaPct) >= 50 ? "high" : "medium",
      title: `${s.label} ${c > p ? "up" : "down"} ${Math.abs(s.deltaPct)}% on the previous period`,
      detail: `${fmt(c)} people against ${fmt(p)} in ${prevLabel}.`,
      evidence: { current: c, previous: p, deltaPct: s.deltaPct, z: round1(z) },
      confidence: confidence(z),
      drill: { stage: s.key },
    });
  }

  // The biggest leak.
  const leaks = stages
    .slice(1)
    .map((s, j) => ({ s, above: stages[j] }))
    .filter(({ above, s }) => above.people >= MIN_BASE && s.fromPrevious !== null && s.coverage.complete);
  if (leaks.length > 0) {
    const worst = leaks.reduce((a, b) => ((b.s.fromPrevious ?? 100) < (a.s.fromPrevious ?? 100) ? b : a));
    const lost = worst.above.people - worst.s.people;
    out.push({
      id: "largest-dropoff",
      kind: "dropoff",
      severity: "high",
      title: `The largest drop is ${worst.above.label} → ${worst.s.label}`,
      detail:
        f.mode === "cohort"
          ? `Only ${worst.s.fromPrevious}% of the ${fmt(worst.above.people)} people who reached ${worst.above.label.toLowerCase()} reached ${worst.s.label.toLowerCase()} — ${fmt(Math.max(0, lost))} did not.`
          : `${worst.s.label} is ${worst.s.fromPrevious}% of ${worst.above.label.toLowerCase()} in this window (activity ratio, not a conversion rate).`,
      evidence: { from: worst.above.people, to: worst.s.people, rate: worst.s.fromPrevious },
      drill: { stage: worst.s.key, dropped: true },
    });
  }

  // Most common paths.
  if (subPaths && subPaths.paths[0] && subPaths.total >= 10) {
    const top = subPaths.paths[0];
    out.push({
      id: "path-subscribed",
      kind: "path",
      severity: "info",
      title: `Most common path to subscribing: ${top.path}`,
      detail: `${fmt(top.people)} of ${fmt(subPaths.total)} subscribers (${top.share}%) took exactly this order of first actions.`,
      evidence: { people: top.people, total: subPaths.total, share: top.share },
      drill: { path: "subscribed" },
    });
  }
  if (abandonPaths && abandonPaths.paths[0] && abandonPaths.total >= 10) {
    const top = abandonPaths.paths[0];
    out.push({
      id: "path-checkout-abandoned",
      kind: "path",
      severity: "medium",
      title: `${fmt(abandonPaths.total)} people started checkout and did not subscribe`,
      detail: `The most common path among them: ${top.path} (${top.share}%).`,
      evidence: { people: abandonPaths.total, topPathPeople: top.people, share: top.share },
      drill: { path: "checkout_abandoned" },
    });
  }

  // Channels that convert materially differently from everyone else.
  if (byChannel?.compare) {
    // Not acquisition channels: app people are signed in by definition, and
    // "Internal" means the true first visit was not captured. They are left
    // out of both sides of the comparison.
    const notChannels = (v: string) => /^(Other|App|Internal|\()/.test(v);
    const groups = byChannel.compare.groups.filter((g) => !notChannels(g.value));
    const total = groups.reduce((a, g) => a + g.people, 0);
    const totalSub = groups.reduce((a, g) => a + g.stages.signup, 0);
    for (const g of groups) {
      if (g.people < 100) continue;
      const restN = total - g.people;
      const restX = totalSub - g.stages.signup;
      if (restN < 100) continue;
      const z = zTest(g.stages.signup, g.people, restX, restN);
      if (Math.abs(z) < 3) continue;
      const r = pct(g.stages.signup, g.people);
      const rr = pct(restX, restN);
      out.push({
        id: `segment-channel-${g.value}`,
        kind: "segment",
        severity: "medium",
        title:
          f.mode === "cohort"
            ? `${g.value} visitors reach sign-up at ${r}% against ${rr}% for everyone else`
            : `${r}% of active people from ${g.value} signed up in the window, against ${rr}% for everyone else`,
        detail: `${fmt(g.stages.signup)} of ${fmt(g.people)} people from ${g.value} against ${fmt(restX)} of ${fmt(restN)} from the other web channels. A difference in who arrives, not necessarily in how the channel works.`,
        evidence: { segmentRate: r, restRate: rr, people: g.people, z: round1(z) },
        confidence: confidence(z),
        drill: { segment: "channel", segmentValue: g.value },
      });
    }
  }

  // Retention: activated vs not (correlation).
  try {
    const ret = await getPlgRetentionService({ ...f, activationDays: 7 });
    const a = ret.groups.find((g) => g.group === "activated");
    const n = ret.groups.find((g) => g.group === "not_activated");
    if (a && n && a.subscribers >= 20 && n.subscribers >= 20) {
      const z = zTest(a.ended + a.scheduled, a.subscribers, n.ended + n.scheduled, n.subscribers);
      if (Math.abs(z) >= Z_CUTOFF) {
        out.push({
          id: "retention-activation",
          kind: "retention",
          severity: "high",
          title: `Subscribers who got value in their first week cancel at ${a.churnRate}% against ${n.churnRate}%`,
          detail: `${fmt(a.ended + a.scheduled)} of ${fmt(a.subscribers)} activated subscribers have cancelled or scheduled it, against ${fmt(n.ended + n.scheduled)} of ${fmt(n.subscribers)} who did not activate. Correlation only — people who planned to stay may simply use more.`,
          evidence: { activatedRate: a.churnRate, notActivatedRate: n.churnRate, z: round1(z) },
          confidence: confidence(z),
          drill: { stage: "post_sub" },
        });
      }
    }
  } catch {
    // Retention is optional context; the rest of the insights stand without it.
  }

  const order = { high: 0, medium: 1, info: 2 };
  out.sort((x, y) => order[x.severity] - order[y.severity]);
  return {
    range: funnel.range,
    previousRange: funnel.previousRange,
    mode: f.mode,
    method:
      "Rate changes: two-proportion z-test, |z| ≥ 1.96 and ≥ 30 people on both sides. Volume changes: ≥ 20% and |z| ≥ 1.96 on the counts. Segment differences: |z| ≥ 3 against all other segments, ≥ 100 people each. Insights state what moved, never why.",
    insights: out,
  };
};

// ── Retention ───────────────────────────────────────────────────────────────

const RET_ACTIVITY = [
  "visit_web",
  "app_open",
  "search_web",
  "search_app",
  "stream",
  "save",
  "project",
  "download",
  "whitelist",
  "video_claim",
  "mix",
];
const RET_CORE = ["download", "whitelist", "video_claim", "mix", "project"];
export const RETENTION_DAYS = [1, 7, 14, 30, 60, 90];

const retentionSql = () => `
WITH ${V2U_CTE},
${actsCte([...RET_ACTIVITY, "renewal"])},
  subs AS MATERIALIZED (
    SELECT DISTINCT ON (us."userId") 'u' || us."userId" AS pk, us."userId" AS uid, us."createdAt" AS t0,
           us."planCode" AS plan, us."paymentProvider" AS provider
      FROM user_subscriptions us
     WHERE us."currentPeriodStart" IS NOT NULL AND us."legacyPlanId" IS NULL
       AND us."createdAt" >= :winStart AND us."createdAt" < :winEnd
       AND (CAST(:surface AS text) = 'all'
            OR (CAST(:surface AS text) = 'app' AND us."paymentProvider" = 'apple')
            OR (CAST(:surface AS text) = 'web' AND COALESCE(us."paymentProvider", '') <> 'apple'))
     ORDER BY us."userId", us."createdAt"
  ),
  act AS MATERIALIZED (
    SELECT s.pk,
           -- COALESCE: a subscriber with no activity at all gets NULL from bool_or,
           -- which would otherwise form a second "not activated" group.
           COALESCE(bool_or(x.a IN (${inList(RET_CORE)}) AND x.at <= s.t0 + make_interval(days => :activationDays)), FALSE) AS activated,
           min(x.at) FILTER (WHERE x.a IN (${inList(RET_CORE)})) AS first_core,
           count(*) FILTER (WHERE x.a = 'download' AND x.at < s.t0 + interval '30 days') AS downloads30,
           count(DISTINCT x.d) FILTER (WHERE x.a = 'download' AND x.at < s.t0 + interval '30 days') AS download_types30,
           count(*) FILTER (WHERE x.a = 'whitelist' AND x.at < s.t0 + interval '30 days') AS whitelists30,
           count(*) FILTER (WHERE x.a IN ('search_web', 'search_app') AND x.at < s.t0 + interval '30 days') AS searches30,
           count(*) FILTER (WHERE x.a = 'stream' AND x.at < s.t0 + interval '30 days') AS streams30,
           count(DISTINCT (x.at AT TIME ZONE 'Asia/Kolkata')::date)
             FILTER (WHERE x.a IN (${inList(RET_ACTIVITY)}) AND x.at < s.t0 + interval '30 days') AS active_days30,
           count(*) FILTER (WHERE x.a = 'visit_web' AND x.at < s.t0 + interval '30 days') AS web_days30,
           max(x.at) FILTER (WHERE x.a IN (${inList(RET_ACTIVITY)})) AS last_active,
           COALESCE(bool_or(x.a = 'renewal'), FALSE) AS renewed
      FROM subs s
      LEFT JOIN acts x ON x.pk = s.pk AND x.at >= s.t0
     GROUP BY s.pk
  ),
  tracks AS (
    SELECT s.pk, count(DISTINCT l."trackCode") AS tracks30
      FROM subs s
      JOIN licenses l ON l."userId" = s.uid AND l."brandId" IS NULL
       AND l."licensedAt" >= s.t0 AND l."licensedAt" < s.t0 + interval '30 days'
     GROUP BY s.pk
  ),
  st AS (
    SELECT s.pk,
           bool_or(u2.status IN ('active', 'past_due')) AS active_now,
           bool_or(u2.status IN ('active', 'past_due') AND u2."cancelAtPeriodEnd") AS scheduled,
           max(u2."cancelledAt") AS cancelled_at
      FROM subs s
      JOIN user_subscriptions u2 ON u2."userId" = s.uid AND u2."currentPeriodStart" IS NOT NULL
     GROUP BY s.pk
  )
SELECT CASE WHEN GROUPING(act.activated) = 1 THEN 'all'
            WHEN act.activated THEN 'activated' ELSE 'not_activated' END AS grp,
       count(*) AS subscribers,
       count(*) FILTER (WHERE st.active_now AND NOT st.scheduled) AS active,
       count(*) FILTER (WHERE st.scheduled) AS scheduled,
       count(*) FILTER (WHERE NOT st.active_now) AS ended,
       count(*) FILTER (WHERE act.renewed) AS renewed,
       count(*) FILTER (WHERE s.t0 <= now() - interval '30 days') AS renewal_eligible,
       percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM st.cancelled_at - s.t0))
         FILTER (WHERE NOT st.active_now AND st.cancelled_at IS NOT NULL) AS med_to_end,
       percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM act.first_core - s.t0)) AS med_to_core,
       avg(act.downloads30) AS downloads30,
       avg(COALESCE(tracks.tracks30, 0)) AS tracks30,
       avg(act.whitelists30) AS whitelists30,
       avg(act.searches30) AS searches30,
       avg(act.streams30) AS streams30,
       avg(act.active_days30) AS active_days30,
       avg(act.web_days30) AS web_days30,
       ${RETENTION_DAYS.map(
         (d) => `count(*) FILTER (WHERE s.t0 <= now() - interval '${d} days') AS "e${d}",
       count(*) FILTER (WHERE s.t0 <= now() - interval '${d} days' AND act.last_active >= s.t0 + interval '${d} days') AS "r${d}"`,
       ).join(",\n       ")}
  FROM subs s
  JOIN act USING (pk)
  JOIN st USING (pk)
  LEFT JOIN tracks USING (pk)
 GROUP BY GROUPING SETS ((act.activated), ())`;

export interface RetentionFilters {
  startDate: string;
  endDate: string;
  surface: "all" | "web" | "app";
  activationDays: number;
  [key: string]: unknown;
}

export const getPlgRetentionService = async (f: RetentionFilters) => {
  const winStart = istMidnight(f.startDate).toISOString();
  const winEnd = istMidnight(addDays(f.endDate, 1)).toISOString();
  const rows = await memo(
    keyOf("plg.retention", { s: f.startDate, e: f.endDate, sf: f.surface, a: f.activationDays }),
    ttlFor(todayIst(), todayIst()),
    () =>
      q<Record<string, unknown>>(retentionSql(), {
        winStart,
        winEnd,
        actFrom: winStart,
        actTo: new Date().toISOString(),
        activationDays: f.activationDays,
        surface: f.surface,
      }),
  );

  const groups = ["all", "activated", "not_activated"].map((g) => {
    const r = rows.find((x) => x.grp === g) ?? {};
    const n = num(r.subscribers);
    const avg = (k: string) => (r[k] === null || r[k] === undefined ? null : round1(Number(r[k])));
    return {
      group: g,
      label: g === "all" ? "All subscribers" : g === "activated" ? `Got value within ${f.activationDays} days` : `No core action within ${f.activationDays} days`,
      subscribers: n,
      active: num(r.active),
      scheduled: num(r.scheduled),
      ended: num(r.ended),
      renewed: num(r.renewed),
      renewalEligible: num(r.renewal_eligible),
      churnRate: pct(num(r.ended) + num(r.scheduled), n),
      renewalRate: num(r.renewal_eligible) > 0 ? pct(num(r.renewed), num(r.renewal_eligible)) : null,
      medianDaysToEnd: r.med_to_end === null || r.med_to_end === undefined ? null : round1(Number(r.med_to_end) / 86400),
      medianHoursToFirstCore: r.med_to_core === null || r.med_to_core === undefined ? null : round1(Number(r.med_to_core) / 3600),
      usage30d: {
        downloads: avg("downloads30"),
        distinctTracks: avg("tracks30"),
        whitelists: avg("whitelists30"),
        searches: avg("searches30"),
        streams: avg("streams30"),
        activeDays: avg("active_days30"),
        webDays: avg("web_days30"),
      },
      retention: RETENTION_DAYS.map((d) => ({
        day: d,
        eligible: num(r[`e${d}`]),
        retained: num(r[`r${d}`]),
        rate: num(r[`e${d}`]) > 0 ? pct(num(r[`r${d}`]), num(r[`e${d}`])) : null,
      })),
    };
  });

  const a = groups[1];
  const b = groups[2];
  const z = zTest(a.ended + a.scheduled, a.subscribers, b.ended + b.scheduled, b.subscribers);
  return {
    range: { startDate: f.startDate, endDate: f.endDate },
    activationDays: f.activationDays,
    coreActions: RET_CORE.map((k) => ({ key: k, label: ACTION_BY_KEY[k]?.label ?? k })),
    groups,
    comparison: {
      churnDifference: round1(a.churnRate - b.churnRate),
      z: round1(z),
      confidence: a.subscribers >= 20 && b.subscribers >= 20 ? confidence(z) : null,
      significant: a.subscribers >= 20 && b.subscribers >= 20 && Math.abs(z) >= Z_CUTOFF,
    },
    notes: [
      "Cohort: first activated subscription of each person created in the window (legacy migrations excluded). Surface 'app' means an Apple purchase.",
      "Churn = ended or scheduled to end. Renewal rate counts only subscribers 30+ days in, and only payments saved with their cycle number — most Razorpay payments since 2026-09-02 lack it until the cycle backfill is re-run, so the rate reads low (see the Metric dictionary's audit).",
      "Day-N retention is rolling: any recorded activity on or after day N. The app reports activity only through logins, so app subscribers read low.",
      "These are correlations. Subscribers who get value early may also be the ones who intended to stay.",
    ],
  };
};
