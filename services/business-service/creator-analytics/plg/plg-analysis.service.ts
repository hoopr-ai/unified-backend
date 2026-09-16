// ─── PLG growth analytics — sub-funnels and stage deep-dives ─────────────────
//
// The main funnel says WHERE people drop. These say what the people on each
// rung did, which behaviours sit next to converting, and how the ordered paths
// inside a stage (search → play → sign up, paywall → pricing → checkout …)
// perform.
//
// Every figure here is an association inside the selected population. None of
// it is evidence of cause, and the payloads say so where it matters.

import { num, pct, round1 } from "../creator-analytics-shared";
import {
  ACTION_BY_KEY,
  SEGMENTS,
  SUB_FUNNELS,
  STAGES,
  type SubFunnelSpec,
} from "./plg-catalogue";
import { STAGE, inList, reachedSql, type PlgFilters } from "./plg-sql";
import { runBatch, runCore, stageCoverage, type Part } from "./plg-funnel.service";

type Row = Record<string, string | number | null>;

/** The person's clock: from first appearance for the horizon, or the window. */
const WITHIN = (f: PlgFilters, x = "x") =>
  f.mode === "cohort"
    ? `${x}.at >= pp.first_seen AND ${x}.at < pp.first_seen + make_interval(days => :horizonDays)`
    : `${x}.at >= :winStart AND ${x}.at < :winEnd`;

const hours = (seconds: unknown): number | null =>
  seconds === null || seconds === undefined ? null : round1(Number(seconds) / 3600);

const labelOf = (key: string) => ACTION_BY_KEY[key]?.label ?? key;

// ── Sub-funnels ─────────────────────────────────────────────────────────────

/** The `sf0 … sfN` CTEs of a sub-funnel — person and time of reaching each step. */
export const subFunnelCtes = (spec: SubFunnelSpec, f: PlgFilters): string => {
  const within = WITHIN(f);
  const ctes = spec.steps.map((st, i) => {
    const detail = st.detail ? ` AND x.d IN (${inList(st.detail)})` : "";
    const acts = inList(st.actions);
    if (i === 0) {
      return `sf0 AS MATERIALIZED (
    SELECT x.pk, min(x.at) AS t
      FROM acts x JOIN pop pp ON pp.pk = x.pk
     WHERE x.a IN (${acts}) AND ${within}${detail}
     GROUP BY x.pk)`;
    }
    const order = st.laterDay
      ? `(x.at AT TIME ZONE 'Asia/Kolkata')::date > (p.t AT TIME ZONE 'Asia/Kolkata')::date`
      : st.repeat
        ? "x.at > p.t"
        : "x.at >= p.t";
    return `sf${i} AS MATERIALIZED (
    SELECT p.pk, min(x.at) AS t
      FROM sf${i - 1} p
      JOIN pop pp ON pp.pk = p.pk
      JOIN acts x ON x.pk = p.pk
     WHERE x.a IN (${acts}) AND ${order} AND ${within}${detail}
     GROUP BY p.pk)`;
  });
  return ctes.join(",\n  ");
};

const subFunnelSql = (spec: SubFunnelSpec, f: PlgFilters): string => {
  const counts = spec.steps.map((_, i) => `(SELECT count(*) FROM sf${i}) AS "c${i}"`);
  const medians = spec.steps.slice(1).map(
    (_, j) =>
      `(SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM b.t - a.t))
          FROM sf${j} a JOIN sf${j + 1} b USING (pk)) AS "m${j + 1}"`,
  );
  return `,
  ${subFunnelCtes(spec, f)}
SELECT ${[...counts, ...medians].join(",\n       ")}`;
};

export const subFunnelActions = (spec: SubFunnelSpec): string[] => [
  ...new Set(spec.steps.flatMap((s) => s.actions)),
];

export const WITHIN_SQL = WITHIN;

export const getPlgSubFunnelService = async (f: PlgFilters, key: string) => {
  const spec = SUB_FUNNELS.find((s) => s.key === key);
  if (!spec) throw new Error(`Unknown PLG sub-funnel: ${key}`);
  const [row] = await runCore<Row>(`plg.sub.${key}`, f, subFunnelSql(spec, f), {
    extraActions: subFunnelActions(spec),
  });

  const first = num(row?.c0);
  // Coverage per step, so a step whose event is newer than the window is
  // marked rather than read as a collapse.
  const lateSteps = spec.steps.map((st) => {
    const late = st.actions.map((k) => ACTION_BY_KEY[k]).filter((a) => a && a.coverageFrom > f.startDate);
    return late.length === st.actions.length ? late.map((a) => a.coverageFrom).sort()[0] : null;
  });

  return {
    key: spec.key,
    group: spec.group,
    label: spec.label,
    question: spec.question,
    missing: spec.missing ?? [],
    mode: f.mode,
    steps: spec.steps.map((st, i) => {
      const people = num(row?.[`c${i}`]);
      const prevPeople = i === 0 ? null : num(row?.[`c${i - 1}`]);
      return {
        label: st.label,
        actions: st.actions,
        people,
        fromPrevious: prevPeople === null ? null : prevPeople > 0 ? pct(people, prevPeople) : null,
        fromFirst: i === 0 ? null : first > 0 ? pct(people, first) : null,
        abandoned: prevPeople === null ? null : Math.max(0, prevPeople - people),
        abandonedPct:
          prevPeople === null || prevPeople === 0 ? null : pct(Math.max(0, prevPeople - people), prevPeople),
        medianHoursFromPrevious: i === 0 ? null : hours(row?.[`m${i}`]),
        instrumentedFrom: lateSteps[i],
      };
    }),
  };
};

export const listSubFunnels = () =>
  SUB_FUNNELS.map((s) => ({ key: s.key, group: s.group, label: s.label, question: s.question, missing: s.missing ?? [] }));

// ── Panel pieces ────────────────────────────────────────────────────────────
//
// A deep-dive is several queries over the same population. Each piece
// contributes its SQL as a `Part`, and a panel runs all of its parts as ONE
// statement over one evaluation of the core (see runBatch), then each piece
// shapes its own rows.

type Batch = Record<string, Record<string, unknown>[]>;

interface Piece<T> {
  parts: Part[];
  shape: (b: Batch) => T;
}

const runPieces = async <T extends Record<string, Piece<unknown>>>(
  name: string,
  f: PlgFilters,
  pieces: T,
): Promise<{ [K in keyof T]: T[K] extends Piece<infer R> ? R : never }> => {
  const batch = await runBatch(name, f, Object.values(pieces).flatMap((p) => p.parts));
  const out: Record<string, unknown> = {};
  for (const [k, piece] of Object.entries(pieces)) out[k] = piece.shape(batch);
  return out as { [K in keyof T]: T[K] extends Piece<infer R> ? R : never };
};

/** A single SELECT as a piece whose result is its rows. */
const rowsPiece = (key: string, sql: string, extraActions: readonly string[] = []): Piece<Row[]> => ({
  parts: [{ key, sql, extraActions }],
  shape: (b) => (b[key] ?? []) as Row[],
});

/** People per value of every listed segment, with how far each group got. */
const dimensionPiece = (f: PlgFilters, key: string, dims: readonly string[], onlyStage?: string) => {
  const specs = SEGMENTS.filter((s) => dims.includes(s.key));
  const extraDims: Record<string, string> = {
    referrer: "pp.referrer_domain",
    landing_path: "pp.landing_path",
  };
  const cols = [
    ...specs.map((s) => ({ key: s.key, label: s.label, sql: s.sql })),
    ...dims
      .filter((d) => extraDims[d])
      .map((d) => ({ key: d, label: d === "referrer" ? "Referring site" : "Entry page", sql: extraDims[d] })),
  ];
  const where = onlyStage ? `WHERE ${reachedSql(onlyStage, f.mode, "reach")}` : "";
  const sql = cols
    .map(
      (c) => `
SELECT '${c.key}' AS dim, COALESCE(${c.sql}::text, '(none)') AS value, count(*) AS n,
       ${STAGES.map((s) => `count(*) FILTER (WHERE ${reachedSql(s.key, f.mode, "reach")}) AS "s_${s.key}"`).join(", ")}
  FROM reach JOIN pop pp USING (pk)
  ${where}
 GROUP BY 2`,
    )
    .join("\nUNION ALL");
  return {
    parts: cols.length ? [{ key, sql }] : [],
    shape: (b: Batch) =>
      cols.map((c) => {
        const mine = ((b[key] ?? []) as Row[])
          .filter((r) => r.dim === c.key)
          .sort((x, y) => num(y.n) - num(x.n));
        const total = mine.reduce((acc, r) => acc + num(r.n), 0);
        return {
          key: c.key,
          label: c.label,
          note: SEGMENTS.find((s) => s.key === c.key)?.note ?? null,
          total,
          rows: mine.slice(0, 15).map((r) => {
            const n = num(r.n);
            const reached: Record<string, number> = {};
            for (const s of STAGES) reached[s.key] = num(r[`s_${s.key}`]);
            return {
              value: r.value as string,
              people: n,
              share: pct(n, total),
              reached,
              activationRate: pct(reached.activation, n),
              signupRate: pct(reached.signup, n),
              intentRate: pct(reached.intent, n),
              subscriptionRate: pct(reached.subscription, n),
            };
          }),
        };
      }),
  };
};

/**
 * Per action: how many people did it, how often, and how many of them went on
 * to subscribe AFTER first doing it.
 */
const associationPiece = (f: PlgFilters, key: string, keys: readonly string[]) => ({
  parts: [
    {
      key,
      extraActions: keys,
      sql: `,
  ia AS (
    SELECT x.pk, x.a, min(x.at) AS t, count(*) AS n, count(DISTINCT x.d) AS nd
      FROM acts x JOIN pop pp ON pp.pk = x.pk
     WHERE x.a IN (${inList(keys)}) AND ${WITHIN(f)}
     GROUP BY x.pk, x.a
  )
SELECT ia.a,
       count(*) AS people,
       sum(ia.n) AS n,
       sum(ia.nd) AS nd,
       count(*) FILTER (WHERE r.t_signup IS NOT NULL) AS signed_up,
       count(*) FILTER (WHERE r.t_subscription IS NOT NULL AND r.t_subscription >= ia.t) AS subscribed_after,
       percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM r.t_subscription - ia.t))
         FILTER (WHERE r.t_subscription >= ia.t) AS med_to_sub,
       percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM ia.t - r.t_traffic)) AS med_from_start
  FROM ia JOIN reach r USING (pk)
 GROUP BY ia.a`,
    },
  ],
  shape: (b: Batch) =>
    keys.map((k) => {
      const r = ((b[key] ?? []) as Row[]).find((x) => x.a === k);
      const people = num(r?.people);
      return {
        action: k,
        label: labelOf(k),
        coverageFrom: ACTION_BY_KEY[k]?.coverageFrom ?? null,
        people,
        events: num(r?.n),
        perPerson: people > 0 ? round1(num(r?.n) / people) : null,
        distinctDetails: num(r?.nd),
        signedUp: num(r?.signed_up),
        subscribedAfter: num(r?.subscribed_after),
        subscribedAfterRate: people > 0 ? pct(num(r?.subscribed_after), people) : null,
        medianHoursToSubscription: hours(r?.med_to_sub),
        medianHoursFromStart: f.mode === "cohort" ? hours(r?.med_from_start) : null,
      };
    }),
});

/** The most common details of an action (queries, plans, entry sources …) and what followed. */
const detailsPiece = (
  f: PlgFilters,
  key: string,
  action: string,
  limit: number,
  followers: readonly string[],
) => ({
  parts: [
    {
      key,
      extraActions: [action, ...followers],
      sql: `,
  dd AS (
    SELECT x.pk, COALESCE(x.d, '(none)') AS d, min(x.at) AS t, count(*) AS n
      FROM acts x JOIN pop pp ON pp.pk = x.pk
     WHERE x.a = ${inList([action])} AND ${WITHIN(f)}
     GROUP BY x.pk, 2
  ),
  nx AS (
    SELECT dd.pk, dd.d,
           ${followers.map((k, i) => `bool_or(y.a = ${inList([k])}) AS f${i}`).join(", ")}
      FROM dd
      LEFT JOIN acts y ON y.pk = dd.pk AND y.at >= dd.t AND y.a IN (${inList(followers)})
     GROUP BY dd.pk, dd.d
  )
SELECT dd.d, count(*) AS people, sum(dd.n) AS n,
       ${followers.map((_, i) => `count(*) FILTER (WHERE nx.f${i}) AS "f${i}"`).join(", ")}
  FROM dd JOIN nx USING (pk, d)
 GROUP BY dd.d
 ORDER BY people DESC, dd.d
 LIMIT ${Math.max(1, Math.floor(limit))}`,
    },
  ],
  shape: (b: Batch) =>
    ((b[key] ?? []) as Row[]).map((r) => {
      const people = num(r.people);
      const after: Record<string, { people: number; rate: number | null }> = {};
      followers.forEach((k, i) => {
        after[k] = { people: num(r[`f${i}`]), rate: people > 0 ? pct(num(r[`f${i}`]), people) : null };
      });
      return { value: r.d as string, people, events: num(r.n), after };
    }),
});

/** Of the people who first did `from`, how many later did each of `then`. */
const followsPiece = (f: PlgFilters, key: string, from: readonly string[], then: readonly string[]) => ({
  parts: [
    {
      key,
      extraActions: [...from, ...then],
      sql: `,
  fs AS (
    SELECT x.pk, min(x.at) AS t
      FROM acts x JOIN pop pp ON pp.pk = x.pk
     WHERE x.a IN (${inList(from)}) AND ${WITHIN(f)}
     GROUP BY x.pk
  )
SELECT count(DISTINCT fs.pk) AS base,
       ${then.map((k, i) => `count(DISTINCT fs.pk) FILTER (WHERE y.a = ${inList([k])}) AS "t${i}"`).join(",\n       ")}
  FROM fs
  LEFT JOIN acts y ON y.pk = fs.pk AND y.at > fs.t AND y.a IN (${inList(then)})`,
    },
  ],
  shape: (b: Batch) => {
    const row = ((b[key] ?? []) as Row[])[0];
    const base = num(row?.base);
    return {
      base,
      then: then.map((k, i) => ({
        action: k,
        label: labelOf(k),
        people: num(row?.[`t${i}`]),
        rate: base > 0 ? pct(num(row?.[`t${i}`]), base) : null,
      })),
    };
  },
});

// ── Stage deep-dives ────────────────────────────────────────────────────────

const trafficPanel = async (f: PlgFilters) => {
  const r = await runPieces("plg.panel.traffic", f, {
    dimensions: dimensionPiece(f, "dims", [
      "auth_state",
      "visitor_type",
      "channel",
      "referrer",
      "landing",
      "landing_path",
      "device",
      "surface",
      "utm_source",
      "utm_campaign",
      "profile_state",
    ]),
  });
  return { coverage: stageCoverage(STAGE("traffic"), f), dimensions: r.dimensions };
};

const activationPanel = async (f: PlgFilters) => {
  const activation = STAGE("activation").actions;
  const r = await runPieces("plg.panel.activation", f, {
    actions: associationPiece(f, "assoc", [...activation, "search_zero", "stream_complete", "browse"]),
    combos: rowsPiece(
      "combos",
      `,
  af AS (
    SELECT pp.pk,
           bool_or(x.a IN ('search_web', 'search_app')) AS s,
           bool_or(x.a = 'stream') AS p,
           bool_or(x.a IN ('save', 'project', 'download')) AS o
      FROM pop pp
      LEFT JOIN acts x ON x.pk = pp.pk AND x.a IN (${inList(activation)}) AND ${WITHIN(f)}
     GROUP BY pp.pk
  )
SELECT CASE
         WHEN af.s AND af.p THEN 'Searched and streamed'
         WHEN af.s THEN 'Searched, no stream'
         WHEN af.p THEN 'Streamed, no search'
         WHEN af.o THEN 'Other value only (save, project, download)'
         ELSE 'Not activated'
       END AS combo,
       count(*) AS people,
       count(*) FILTER (WHERE r.t_signup IS NOT NULL) AS signed_up,
       count(*) FILTER (WHERE r.t_intent IS NOT NULL) AS intent,
       count(*) FILTER (WHERE r.t_subscription IS NOT NULL) AS subscribed
  FROM af JOIN reach r USING (pk)
 GROUP BY 1
 ORDER BY 2 DESC`,
    ),
    queries: detailsPiece(f, "queries", "search_web", 20, ["stream", "account_created", "subscribed"]),
    afterSearch: followsPiece(f, "afterSearch", ["search_web", "search_app"], [
      "stream",
      "save",
      "account_created",
      "pricing_view",
      "subscribed",
    ]),
    afterStream: followsPiece(f, "afterStream", ["stream"], [
      "stream_complete",
      "save",
      "free_plays_out",
      "account_created",
      "pricing_view",
      "subscribed",
    ]),
    streams: rowsPiece(
      "streams",
      `
SELECT count(DISTINCT x.pk) AS people, count(*) AS plays, count(DISTINCT x.d) AS tracks,
       count(DISTINCT (x.pk, x.d)) AS person_tracks
  FROM acts x JOIN pop pp ON pp.pk = x.pk
 WHERE x.a = 'stream' AND ${WITHIN(f)}`,
    ),
    first: rowsPiece(
      "first",
      `
SELECT pp.first_action, count(*) AS people,
       count(*) FILTER (WHERE r.t_signup IS NOT NULL) AS signed_up,
       count(*) FILTER (WHERE r.t_subscription IS NOT NULL) AS subscribed
  FROM reach r JOIN pop pp USING (pk)
 WHERE r.t_activation IS NOT NULL
 GROUP BY 1 ORDER BY 2 DESC`,
    ),
  });

  const search = r.actions.filter((a) => a.action === "search_web" || a.action === "search_app");
  const zero = r.actions.find((a) => a.action === "search_zero");
  const web = r.actions.find((a) => a.action === "search_web");
  const st = r.streams[0] ?? {};
  const streamPeople = num(st.people);

  return {
    coverage: stageCoverage(STAGE("activation"), f),
    actions: r.actions,
    search: {
      people: search.reduce((acc, a) => acc + a.people, 0),
      note: "Web searches (anyone) plus signed-in searches from the search service; a person searching on both is counted in each row.",
      searches: search.reduce((acc, a) => acc + a.events, 0),
      zeroResultShare: web && web.events > 0 && zero ? pct(zero.events, web.events) : null,
      topQueries: r.queries,
      afterFirstSearch: r.afterSearch,
    },
    stream: {
      people: streamPeople,
      plays: num(st.plays),
      playsPerPerson: streamPeople > 0 ? round1(num(st.plays) / streamPeople) : null,
      distinctTracks: num(st.tracks),
      tracksPerPerson: streamPeople > 0 ? round1(num(st.person_tracks) / streamPeople) : null,
      afterFirstStream: r.afterStream,
      note: "Web only — the app records no plays. Listening time is not captured.",
    },
    combinations: r.combos.map((c) => {
      const people = num(c.people);
      return {
        combo: c.combo as string,
        people,
        signupRate: pct(num(c.signed_up), people),
        intentRate: pct(num(c.intent), people),
        subscriptionRate: pct(num(c.subscribed), people),
      };
    }),
    firstAction: r.first.map((x) => ({
      action: x.first_action as string,
      label: labelOf(x.first_action as string),
      people: num(x.people),
      signupRate: pct(num(x.signed_up), num(x.people)),
      subscriptionRate: pct(num(x.subscribed), num(x.people)),
    })),
    caveat:
      "Associations, not causes: people who search are also people who came looking for something. " +
      "Compare rates between groups, but do not read them as the effect of the action.",
  };
};

const signupPanel = async (f: PlgFilters) => {
  const r = await runPieces("plg.panel.signup", f, {
    dimensions: dimensionPiece(f, "dims", ["signup_method", "surface", "channel", "landing", "device"], "signup"),
    actions: associationPiece(f, "assoc", [
      "free_plays_out",
      "auth_prompt",
      "otp_requested",
      "otp_verified",
      "new_account_web",
      "login",
      "account_created",
      "onboarded",
    ]),
  });
  return {
    coverage: stageCoverage(STAGE("signup"), f),
    subFunnels: ["signup_web", "signup_prompt", "signup_all"],
    actions: r.actions,
    dimensions: r.dimensions,
  };
};

const intentPanel = async (f: PlgFilters) => {
  const intent = STAGE("intent").actions;
  const r = await runPieces("plg.panel.intent", f, {
    actions: associationPiece(f, "assoc", [...intent, "checkout_abandoned", "download_attempt"]),
    entrySources: detailsPiece(f, "entry", "pricing_entry", 20, ["checkout", "subscribed"]),
    plans: detailsPiece(f, "plans", "checkout", 15, ["subscribed"]),
    attempts: detailsPiece(f, "attempts", "download_attempt", 5, ["pricing_view", "checkout", "subscribed"]),
    first: rowsPiece(
      "first",
      `,
  fi AS (
    SELECT DISTINCT ON (x.pk) x.pk, x.a, x.at
      FROM acts x JOIN pop pp ON pp.pk = x.pk
     WHERE x.a IN (${inList(intent)}) AND ${WITHIN(f)}
     ORDER BY x.pk, x.at
  )
SELECT fi.a, count(*) AS people,
       count(*) FILTER (WHERE r.t_subscription >= fi.at) AS subscribed_after,
       count(*) FILTER (WHERE pp.auth_state = 'Signed out') AS signed_out,
       count(*) FILTER (WHERE pp.auth_state = 'Signed up') AS signed_up,
       count(*) FILTER (WHERE pp.auth_state = 'Subscribed') AS subscribed_state
  FROM fi JOIN reach r USING (pk) JOIN pop pp USING (pk)
 GROUP BY fi.a ORDER BY 2 DESC`,
    ),
  });
  return {
    coverage: stageCoverage(STAGE("intent"), f),
    subFunnels: ["intent_pricing", "intent_download", "intent_locked", "intent_checkout"],
    actions: r.actions,
    firstIntentAction: r.first.map((x) => {
      const people = num(x.people);
      return {
        action: x.a as string,
        label: labelOf(x.a as string),
        people,
        subscribedAfter: num(x.subscribed_after),
        subscribedAfterRate: pct(num(x.subscribed_after), people),
        byState: {
          signedOut: num(x.signed_out),
          signedUp: num(x.signed_up),
          subscribed: num(x.subscribed_state),
        },
      };
    }),
    pricingEntrySources: {
      rows: r.entrySources,
      note:
        "From the PRICING_VIEWED event, which records the action that sent the visitor to pricing. It exists from 2026-09-16; earlier pricing visits have no source.",
    },
    checkoutPlans: r.plans,
    downloadAttempts: r.attempts,
    caveat:
      "‘Subscribed after’ counts people who subscribed at or after first doing the action. It shows association, not that the action caused the subscription.",
  };
};

const subscriptionPanel = async (f: PlgFilters) => {
  const r = await runPieces("plg.panel.subscription", f, {
    dimensions: dimensionPiece(
      f,
      "dims",
      ["plan", "channel", "visitor_type", "first_action", "surface", "landing", "device"],
      "subscription",
    ),
    plans: rowsPiece(
      "plans",
      `
SELECT split_part(x.d, '|', 1) AS plan, split_part(x.d, '|', 2) AS provider,
       count(DISTINCT x.pk) AS people
  FROM acts x JOIN pop pp ON pp.pk = x.pk
 WHERE x.a = 'subscribed' AND ${WITHIN(f)}
 GROUP BY 1, 2 ORDER BY 3 DESC`,
    ),
    times: rowsPiece(
      "times",
      `,
  fx AS (
    SELECT x.pk,
           min(x.at) FILTER (WHERE x.a IN (${inList(STAGE("activation").actions)})) AS t_act,
           min(x.at) FILTER (WHERE x.a IN (${inList(STAGE("intent").actions)})) AS t_int,
           min(x.at) FILTER (WHERE x.a = 'checkout') AS t_chk
      FROM acts x JOIN pop pp ON pp.pk = x.pk
     WHERE ${WITHIN(f)}
     GROUP BY x.pk
  )
SELECT count(*) FILTER (WHERE r.t_signup IS NOT NULL) AS signups,
       count(*) FILTER (WHERE r.t_signup IS NOT NULL AND r.t_subscription IS NOT NULL) AS signup_to_sub,
       count(*) FILTER (WHERE r.t_intent IS NOT NULL) AS intents,
       count(*) FILTER (WHERE r.t_intent IS NOT NULL AND r.t_subscription IS NOT NULL) AS intent_to_sub,
       count(*) FILTER (WHERE fx.t_chk IS NOT NULL) AS checkouts,
       count(*) FILTER (WHERE fx.t_chk IS NOT NULL AND r.t_subscription IS NOT NULL) AS checkout_to_sub,
       count(*) AS traffic,
       count(*) FILTER (WHERE r.t_subscription IS NOT NULL) AS subscribed,
       percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM r.t_subscription - r.t_signup))
         FILTER (WHERE r.t_subscription >= r.t_signup) AS med_signup_sub,
       percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM r.t_subscription - fx.t_act))
         FILTER (WHERE r.t_subscription >= fx.t_act) AS med_act_sub,
       percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM r.t_subscription - fx.t_int))
         FILTER (WHERE r.t_subscription >= fx.t_int) AS med_int_sub,
       percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM r.t_subscription - r.t_traffic))
         FILTER (WHERE r.t_subscription IS NOT NULL) AS med_start_sub
  FROM reach r LEFT JOIN fx USING (pk)`,
    ),
    before: rowsPiece(
      "before",
      `,
  bi AS (
    SELECT DISTINCT ON (x.pk) x.pk, x.a
      FROM acts x
      JOIN pop pp ON pp.pk = x.pk
      JOIN reach r ON r.pk = x.pk
     WHERE r.t_subscription IS NOT NULL
       AND x.a IN (${inList(STAGE("intent").actions.filter((k) => k !== "checkout"))})
       AND x.at <= r.t_subscription AND ${WITHIN(f)}
     ORDER BY x.pk, x.at DESC
  )
SELECT bi.a, count(*) AS people FROM bi GROUP BY 1 ORDER BY 2 DESC`,
    ),
  });

  const t = r.times[0] ?? {};
  const rate = (a: string, b: string) => (num(t[b]) > 0 ? pct(num(t[a]), num(t[b])) : null);
  const subscribers = num(t.subscribed);
  return {
    coverage: stageCoverage(STAGE("subscription"), f),
    subFunnels: ["subscription_core", "intent_checkout"],
    conversions: {
      signupToSubscription: { rate: rate("signup_to_sub", "signups"), numerator: num(t.signup_to_sub), denominator: num(t.signups) },
      intentToSubscription: { rate: rate("intent_to_sub", "intents"), numerator: num(t.intent_to_sub), denominator: num(t.intents) },
      checkoutToSubscription: { rate: rate("checkout_to_sub", "checkouts"), numerator: num(t.checkout_to_sub), denominator: num(t.checkouts) },
      trafficToSubscription: { rate: rate("subscribed", "traffic"), numerator: subscribers, denominator: num(t.traffic) },
    },
    medianHours: {
      signupToSubscription: hours(t.med_signup_sub),
      firstActionToSubscription: hours(t.med_act_sub),
      firstIntentToSubscription: hours(t.med_int_sub),
      firstVisitToSubscription: f.mode === "cohort" ? hours(t.med_start_sub) : null,
    },
    plans: r.plans.map((p) => ({ plan: p.plan as string, provider: p.provider as string, people: num(p.people) })),
    lastIntentBeforeSubscribing: r.before.map((x) => ({
      action: x.a as string,
      label: labelOf(x.a as string),
      people: num(x.people),
      share: pct(num(x.people), subscribers),
    })),
    dimensions: r.dimensions,
    note:
      f.mode === "activity"
        ? "Activity mode: the conversions are among people who did each step inside the window, so a subscriber who signed up earlier is not in 'signup → subscription'."
        : null,
  };
};

const POST_EXTRA = ["search_web", "search_app", "stream", "save"];

const postSubPanel = async (f: PlgFilters) => {
  const value = STAGE("post_sub").actions;
  const keys = [...value, ...POST_EXTRA];
  const r = await runPieces("plg.panel.post", f, {
    rows: rowsPiece(
      "post",
      `,
  subs AS (
    SELECT r.pk, COALESCE(r.t_subscription, pp.paid_since) AS t0
      FROM reach r JOIN pop pp USING (pk)
     WHERE ${f.mode === "cohort" ? "r.t_subscription IS NOT NULL" : "COALESCE(r.t_subscription, pp.paid_since) IS NOT NULL"}
  ),
  va AS (
    SELECT s.pk, x.a, min(x.at) AS t, count(*) AS n, count(DISTINCT x.d) AS nd,
           count(DISTINCT (x.at AT TIME ZONE 'Asia/Kolkata')::date) AS days,
           min(s.t0) AS t0
      FROM subs s
      JOIN acts x ON x.pk = s.pk AND x.at >= s.t0
     WHERE x.a IN (${inList(keys)})
       AND ${
         f.mode === "cohort"
           ? "x.at < s.t0 + make_interval(days => :horizonDays)"
           : "x.at >= :winStart AND x.at < :winEnd"
       }
     GROUP BY s.pk, x.a
  )
SELECT 'all' AS a, (SELECT count(*) FROM subs) AS people, NULL::numeric AS n, NULL::numeric AS nd,
       NULL::bigint AS repeat_people, NULL::double precision AS med_first
UNION ALL
SELECT va.a, count(*), sum(va.n), sum(va.nd),
       count(*) FILTER (WHERE va.days > 1),
       percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM va.t - va.t0))
  FROM va GROUP BY va.a`,
      keys,
    ),
  });
  const rows = r.rows;
  const subscribers = num(rows.find((x) => x.a === "all")?.people);
  return {
    coverage: stageCoverage(STAGE("post_sub"), f),
    subscribers,
    subFunnels: ["post_first_action", "post_download", "post_whitelist"],
    actions: keys.map((k) => {
      const x = rows.find((y) => y.a === k);
      const people = num(x?.people);
      return {
        action: k,
        label: labelOf(k),
        core: value.includes(k),
        subscribers: people,
        share: pct(people, subscribers),
        events: num(x?.n),
        perSubscriber: people > 0 ? round1(num(x?.n) / people) : null,
        distinctDetails: num(x?.nd),
        repeatSubscribers: num(x?.repeat_people),
        // In activity mode the clock starts at a subscription that may be
        // years old (migrated plans), so a "time to first" means nothing.
        medianHoursToFirst: f.mode === "cohort" ? hours(x?.med_first) : null,
      };
    }),
    note:
      f.mode === "cohort"
        ? "Subscribers of this cohort, and what they did in the conversion window after subscribing."
        : "Everyone with paid access during the window, and what they did in it after their subscription began.",
  };
};

export const PANEL_STAGES = ["traffic", "activation", "signup", "intent", "subscription", "post_sub"] as const;

export const getPlgStageService = async (f: PlgFilters, stage: string) => {
  const base = { stage, label: STAGE(stage).label, question: STAGE(stage).question, mode: f.mode };
  switch (stage) {
    case "traffic":
      return { ...base, ...(await trafficPanel(f)) };
    case "activation":
      return { ...base, ...(await activationPanel(f)) };
    case "signup":
      return { ...base, ...(await signupPanel(f)) };
    case "intent":
      return { ...base, ...(await intentPanel(f)) };
    case "subscription":
      return { ...base, ...(await subscriptionPanel(f)) };
    case "post_sub":
      return { ...base, ...(await postSubPanel(f)) };
    default:
      throw new Error(`Unknown PLG stage: ${stage}`);
  }
};
