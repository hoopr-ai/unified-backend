// ─── Platform overview ───────────────────────────────────────────────────────
//
// What the platform IS — how much catalogue there is, how many people are on
// it, what they have made, what has been collected — with an optional window
// laid over it.
//
// ── TWO NUMBERS PER FACT, AND THE LABEL SAYS WHICH IS WHICH ─────────────────
//
// Every fact carries BOTH its all-time total and, when a window is asked for,
// the figure inside that window. That pairing is the design.
//
// "Tracks" all-time is the size of the catalogue. "Tracks" over 30 days is how
// many were ADDED. Those are different facts wearing one word, and a view that
// shows only the second under the first's label is the most misleading thing
// this dashboard could do. So the windowed figure leads, the all-time total
// sits under it as "of 22,787 all time", and nobody has to guess.
//
// A few facts have no date column to window by — "tracks with stems" is a
// distinct count over a join, "people who downloaded" is a distinct count of
// users. Those are marked `allTimeOnly` and render as such rather than
// silently reporting an all-time number inside a window.
//
// ── FACTS ARE DATA, NOT QUERIES ─────────────────────────────────────────────
//
// Forty-odd facts hand-written would be forty places to forget the window
// predicate or the IST boundary. They are declared as specs grouped by SOURCE
// — one FROM clause — and a runner turns each source into a SINGLE statement
// whose columns are `count(*) FILTER (...)` per fact per window. So the whole
// Catalogue section is one pass over `tracks`, one over `creator_stems`, one
// over `artists`, and so on, rather than one query per number.
//
// ── NO ORIGIN FILTER HERE, DELIBERATELY ─────────────────────────────────────
//
// Half of these facts are catalogue rows with no owner to derive an origin
// from. A filter that silently applied to the People half while the Catalogue
// half ignored it would be invisible state of exactly the kind that gets a
// wrong number quoted. Activity carries the origin split; this view carries the
// window.

import {
  q,
  num,
  pct,
  delta,
  tablesExist,
  creatorUsersCte,
  captureStart,
  previousPeriod,
  TX_SCOPE,
  TX_RENEWAL,
  ORIGIN_LABELS,
  ORIGINS,
  ORIGIN_NOTE,
  REVENUE_NOTE,
  type CreatorFilters,
} from "./creator-analytics-shared";

const round2 = (v: unknown): number => Math.round(num(v) * 100) / 100;

/** How a fact is aggregated. `filter` is the full predicate for one window. */
type Agg = (filter: string) => string;

const COUNT: Agg = (f) => `count(*) FILTER (WHERE ${f})`;
const countDistinct =
  (col: string): Agg =>
  (f) => `count(DISTINCT ${col}) FILTER (WHERE ${f})`;
const sumOf =
  (col: string): Agg =>
  (f) => `COALESCE(sum(${col}) FILTER (WHERE ${f}), 0)`;

interface FactSpec {
  key: string;
  label: string;
  hint?: string;
  /** Renders larger — the number the section is really about. */
  primary?: boolean;
  /** Rupees rather than a count. */
  money?: boolean;
  /** Predicate selecting this fact's rows out of the source. */
  where?: string;
  agg?: Agg;
  /** The drill-down this fact opens, and the bucket that reproduces it. */
  metric?: string;
  dimension?: string;
  dimensionValue?: string;
  /** Key of the fact this is a share of. */
  shareOf?: string;
  /**
   * No date column applies — a distinct count over a join, or a total that
   * only means anything cumulatively. Reported as all-time even under a window,
   * and flagged so the UI can say so.
   */
  allTimeOnly?: boolean;
}

interface FactSource {
  /** Probed before the query runs; a missing one drops these facts. */
  tables: string[];
  from: string;
  /** Null when nothing in this source can be windowed. */
  dateCol: string | null;
  /** Prefix, for the sources that need the creator_users CTE. */
  cte?: string;
  facts: FactSpec[];
}

/** One resolved number. */
export interface OverviewFact {
  key: string;
  label: string;
  /** The figure for the selected window, or the all-time total when unwindowed. */
  value: number;
  /** Always the all-time figure, for context under a windowed value. */
  total: number;
  /** Present only when a window is applied and the fact can be windowed. */
  previousValue?: number;
  deltaPct?: number | null;
  /** True when the window does not apply to this fact. */
  allTimeOnly?: boolean;
  money?: boolean;
  primary?: boolean;
  hint?: string;
  metric?: string;
  dimension?: string;
  dimensionValue?: string;
  /** Share of the fact named by `shareOf`, computed on whichever value shows. */
  sharePct?: number;
}

export interface OverviewSection {
  key: string;
  title: string;
  sub: string;
  facts: OverviewFact[];
}

/**
 * Runs one source and resolves its facts.
 *
 * Three columns per fact — all-time, in-window, previous-window — from a single
 * scan. The window columns are omitted entirely when no window was asked for,
 * so the unwindowed page costs exactly what it did before this feature existed.
 */
const runSource = async (
  src: FactSource,
  win: { curr: string; prev: string } | null,
): Promise<Record<string, { all: number; win: number; prev: number }>> => {
  const cols: string[] = [];

  for (const f of src.facts) {
    const agg = f.agg ?? COUNT;
    const base = f.where ?? "TRUE";
    cols.push(`${agg(base)} AS "${f.key}__all"`);
    // A fact with no date column of its own repeats its all-time figure rather
    // than being windowed by a column that does not describe it.
    if (win && src.dateCol && !f.allTimeOnly) {
      cols.push(`${agg(`(${base}) AND ${win.curr}`)} AS "${f.key}__win"`);
      cols.push(`${agg(`(${base}) AND ${win.prev}`)} AS "${f.key}__prev"`);
    }
  }

  const rows = await q<Record<string, string>>(
    `${src.cte ?? ""}
     SELECT ${cols.join(",\n            ")}
       FROM ${src.from}`,
  );
  const r = rows[0] ?? {};

  const out: Record<string, { all: number; win: number; prev: number }> = {};
  for (const f of src.facts) {
    const all = num(r[`${f.key}__all`]);
    const hasWindow = win && src.dateCol && !f.allTimeOnly;
    out[f.key] = {
      all,
      win: hasWindow ? num(r[`${f.key}__win`]) : all,
      prev: hasWindow ? num(r[`${f.key}__prev`]) : all,
    };
  }
  return out;
};

/** Turns raw counts into the payload's facts, applying money rounding + shares. */
const resolve = (
  specs: FactSpec[],
  raw: Record<string, { all: number; win: number; prev: number }>,
  windowed: boolean,
): OverviewFact[] => {
  const shaped = specs.map((f) => {
    const n = raw[f.key] ?? { all: 0, win: 0, prev: 0 };
    const fix = (v: number) => (f.money ? round2(v) : v);
    const canWindow = windowed && !f.allTimeOnly;
    return {
      spec: f,
      fact: {
        key: f.key,
        label: f.label,
        value: fix(canWindow ? n.win : n.all),
        total: fix(n.all),
        ...(canWindow
          ? { previousValue: fix(n.prev), deltaPct: delta(fix(n.win), fix(n.prev)) }
          : {}),
        ...(windowed && f.allTimeOnly ? { allTimeOnly: true } : {}),
        ...(f.money ? { money: true } : {}),
        ...(f.primary ? { primary: true } : {}),
        ...(f.hint ? { hint: f.hint } : {}),
        ...(f.metric ? { metric: f.metric } : {}),
        ...(f.dimension ? { dimension: f.dimension } : {}),
        ...(f.dimensionValue !== undefined ? { dimensionValue: f.dimensionValue } : {}),
      } as OverviewFact,
    };
  });

  const byKey = new Map(shaped.map((s) => [s.fact.key, s.fact]));
  for (const { spec, fact } of shaped) {
    if (!spec.shareOf) continue;
    const base = byKey.get(spec.shareOf);
    // The share is computed on the value actually SHOWING, so a windowed
    // sub-count reads as a share of the windowed total rather than of an
    // all-time figure that is not on screen.
    if (base) fact.sharePct = pct(fact.value, base.value);
  }
  return shaped.map((s) => s.fact);
};

// ── The facts ───────────────────────────────────────────────────────────────

const catalogueSources = (): FactSource[] => [
  {
    tables: ["tracks", "owners"],
    from: `tracks x`,
    dateCol: `x."createdAt"`,
    facts: [
      {
        key: "tracks",
        label: "Tracks",
        primary: true,
        hint: "Everything in the catalogue, live and retired",
        metric: "tracks",
      },
      {
        key: "activeMusic",
        label: "Live music",
        where: `x.status = 'ACTIVE' AND x.type = 'music'`,
        shareOf: "tracks",
        metric: "tracks",
        dimension: "type",
        dimensionValue: "music",
      },
      {
        key: "activeSfx",
        label: "Live SFX",
        where: `x.status = 'ACTIVE' AND x.type = 'sfx'`,
        shareOf: "tracks",
        metric: "tracks",
        dimension: "type",
        dimensionValue: "sfx",
      },
      {
        key: "retiredTracks",
        label: "Retired",
        where: `x.status <> 'ACTIVE'`,
        shareOf: "tracks",
        hint: "Not ACTIVE — still in the catalogue, not offered",
        metric: "tracks",
      },
      {
        key: "vocalTracks",
        label: "With vocals",
        where: `x."hasVocals"`,
        shareOf: "tracks",
        metric: "tracks",
        dimension: "vocals",
        dimensionValue: "With vocals",
      },
      {
        key: "instrumentalTracks",
        label: "Instrumental",
        where: `x."hasVocals" IS NOT TRUE`,
        shareOf: "tracks",
        metric: "tracks",
        dimension: "vocals",
        dimensionValue: "Instrumental",
      },
    ],
  },
  {
    tables: ["creator_stems"],
    from: `creator_stems x`,
    dateCol: `x.created_at`,
    facts: [
      {
        key: "stems",
        label: "Stems",
        where: `x.deleted IS NULL`,
        hint: "Multitrack layers, soft-deleted ones excluded",
        metric: "stems",
      },
      {
        key: "tracksWithStems",
        label: "Tracks with stems",
        where: `x.deleted IS NULL`,
        agg: countDistinct(`x.track_id`),
        hint: "Distinct tracks carrying at least one stem",
      },
    ],
  },
  {
    tables: ["artists", "track_artist_mappings"],
    from: `artists x`,
    dateCol: `x."createdAt"`,
    facts: [
      { key: "artists", label: "Artists", metric: "artists" },
      {
        key: "nativeArtists",
        label: "With a Creator page",
        where: `x."nativeArtist"`,
        shareOf: "artists",
        hint: "Surfaced on creator-web, not just credited",
        metric: "artists",
      },
    ],
  },
  {
    tables: ["albums"],
    from: `albums x`,
    dateCol: `x."createdAt"`,
    facts: [
      { key: "albums", label: "Albums", where: `x.deleted IS NULL`, metric: "albums" },
    ],
  },
  {
    tables: ["playlists"],
    from: `playlists x`,
    dateCol: `x."createdAt"`,
    facts: [
      {
        key: "hooprPlaylists",
        label: "Hoopr playlists",
        hint: "Curated and system playlists — not creators' own collections",
        metric: "hooprPlaylists",
      },
      {
        key: "activeHooprPlaylists",
        label: "Live playlists",
        where: `x.status = 'ACTIVE'`,
        shareOf: "hooprPlaylists",
        metric: "hooprPlaylists",
        dimension: "status",
        dimensionValue: "ACTIVE",
      },
    ],
  },
  {
    tables: ["track_playlist_mappings"],
    from: `track_playlist_mappings x`,
    // No timestamp on the mapping table, so placements are all-time only.
    dateCol: null,
    facts: [
      {
        key: "playlistPlacements",
        label: "Tracks in playlists",
        allTimeOnly: true,
        hint: "Placements, not distinct tracks — one track can sit in several",
      },
    ],
  },
];

const peopleSources = async (): Promise<FactSource[]> => {
  // MATERIALIZED, and it is load-bearing: the accounts query below reads
  // `cu.origin` in four separate FILTER clauses, and an inlined CTE re-runs the
  // four-EXISTS origin ladder over all 461k users once per reference. Measured
  // on prod that did not finish inside the statement timeout; materialised it
  // is 1.4s. See creatorUsersCte's docstring.
  const cte = `WITH ${await creatorUsersCte({ materialized: true })}`;
  return [
    {
      tables: ["users"],
      from: `creator_users cu`,
      dateCol: `cu."createdAt"`,
      cte,
      facts: [
        {
          key: "creators",
          label: "Creator accounts",
          primary: true,
          hint: "Every account on the CREATOR platform",
          metric: "signups",
        },
        {
          key: "activeCreators",
          label: "Active",
          where: `cu.status = 'ACTIVE'`,
          shareOf: "creators",
          metric: "signups",
        },
        {
          key: "deactivatedCreators",
          label: "Deactivated",
          where: `cu.status = 'DELETED'`,
          shareOf: "creators",
          metric: "signups",
        },
        ...ORIGINS.map((o) => ({
          key: `origin${o}`,
          label: ORIGIN_LABELS[o],
          where: `cu.origin = '${o}'`,
          shareOf: "creators",
          hint:
            o === "WEB"
              ? "No app evidence — includes every account the legacy migration bulk-loaded"
              : undefined,
          metric: "signups",
          dimension: "origin",
          dimensionValue: o,
        })),
      ],
    },
    {
      tables: ["user_subscriptions"],
      from: `user_subscriptions s`,
      dateCol: `s."createdAt"`,
      facts: [
        {
          key: "allSubscriptions",
          label: "Subscriptions ever",
          metric: "subscriptions",
        },
        {
          key: "liveSubscriptions",
          label: "Live subscriptions",
          // Point-in-time by nature: a subscription is live NOW or it is not.
          // Windowing it by createdAt would answer "started in this window and
          // is still live", which is a different and much smaller number.
          where: `s.status IN ('active', 'past_due')`,
          allTimeOnly: true,
          hint: "active + past_due — both still have the product, as of now",
          metric: "subscriptions",
        },
        {
          key: "liveSubscribers",
          label: "Subscribers",
          where: `s.status IN ('active', 'past_due')`,
          agg: countDistinct(`s."userId"`),
          allTimeOnly: true,
          hint: "Distinct people holding a live plan right now",
        },
        {
          key: "livePaidSubscriptions",
          label: "…with a payment instrument",
          where: `s.status IN ('active', 'past_due')
                  AND (s."razorpaySubscriptionId" IS NOT NULL
                       OR s."appleOriginalTxId" IS NOT NULL)`,
          shareOf: "liveSubscriptions",
          allTimeOnly: true,
          hint: "A Razorpay mandate or an Apple receipt behind the row; the rest are comped",
        },
      ],
    },
    {
      tables: ["soundtracking_user_profiles"],
      from: `soundtracking_user_profiles x`,
      dateCol: null,
      facts: [
        {
          key: "creatorProfiles",
          label: "Creator profiles",
          allTimeOnly: true,
          hint: "Accounts that have filled in a soundtracking profile",
        },
      ],
    },
  ];
};

const activitySources = (): FactSource[] => [
  {
    tables: ["licenses"],
    from: `licenses x`,
    dateCol: `x."licensedAt"`,
    facts: [
      {
        key: "downloads",
        label: "Downloads",
        primary: true,
        where: `lower(COALESCE(x.status, 'active')) <> 'pending'`,
        hint: "One licence row per export",
        metric: "downloads",
      },
      {
        key: "stemDownloads",
        label: "…of stems",
        where: `lower(COALESCE(x.status, 'active')) <> 'pending' AND x.type = 'stem'`,
        shareOf: "downloads",
        metric: "downloads",
        dimension: "assetType",
        dimensionValue: "stem",
      },
      {
        key: "downloaders",
        label: "People who downloaded",
        where: `lower(COALESCE(x.status, 'active')) <> 'pending'`,
        agg: countDistinct(`x."userId"`),
      },
    ],
  },
  {
    tables: ["user_liked_tracks"],
    from: `user_liked_tracks x`,
    dateCol: `x."createdAt"`,
    facts: [
      { key: "likes", label: "Tracks favourited", metric: "likes" },
      {
        key: "likers",
        label: "People who favourited",
        agg: countDistinct(`x."userId"`),
      },
    ],
  },
  {
    tables: ["creator_liked_playlists"],
    from: `creator_liked_playlists x`,
    dateCol: `x.created_at`,
    facts: [
      {
        key: "playlistLikes",
        label: "Playlists favourited",
        where: `x.liked IS TRUE`,
        metric: "playlistLikes",
      },
    ],
  },
  {
    tables: ["collections"],
    from: `collections x`,
    dateCol: `x."createdAt"`,
    facts: [
      {
        key: "collections",
        label: "Creator collections",
        where: `COALESCE(x.status, 'ACTIVE') <> 'DELETED'`,
        hint: "Creators' OWN playlists — not the curated Hoopr ones",
        metric: "collections",
      },
    ],
  },
  {
    tables: ["collection_items"],
    from: `collection_items x`,
    dateCol: `x."createdAt"`,
    facts: [
      {
        key: "collectionItems",
        label: "Tracks saved into them",
        metric: "collectionItems",
      },
    ],
  },
  {
    tables: ["sound_projects"],
    from: `sound_projects x`,
    dateCol: `x."createdAt"`,
    facts: [
      {
        key: "projects",
        label: "Video projects",
        hint: "Editor sessions in the app",
        metric: "projects",
      },
    ],
  },
  {
    tables: ["video_links"],
    from: `video_links x`,
    dateCol: `x."createdAt"`,
    facts: [{ key: "claims", label: "Reel claims", metric: "claims" }],
  },
  {
    tables: ["native_shares"],
    from: `native_shares x`,
    dateCol: `x."createdAt"`,
    facts: [
      {
        key: "shares",
        label: "Shares",
        hint: "Includes anonymous shares, which the per-person drill-down cannot show",
        metric: "shares",
      },
      {
        key: "shareClicks",
        label: "Clicks on shares",
        agg: sumOf(`x."clickCount"`),
        hint: "Counted against the day the share was created, not the day it was clicked",
      },
    ],
  },
  {
    tables: ["native_referrals"],
    from: `native_referrals x`,
    dateCol: `COALESCE(x."joinedAt", x."createdAt")`,
    facts: [
      { key: "referrals", label: "Referrals", metric: "referrals" },
      {
        key: "completedReferrals",
        label: "…completed",
        where: `x.status = 'COMPLETED'`,
        shareOf: "referrals",
        metric: "referrals",
        dimension: "status",
        dimensionValue: "COMPLETED",
      },
    ],
  },
];

const moneySources = (): FactSource[] => [
  {
    tables: ["transactions"],
    from: `transactions t`,
    dateCol: `t."createdAt"`,
    facts: [
      {
        key: "lifetimeRevenue",
        label: "Subscription revenue",
        primary: true,
        money: true,
        where: TX_SCOPE,
        agg: sumOf(`t."totalAmount"`),
        hint: "Plan-cycle money that arrived, legacy backfill included",
        metric: "payments",
      },
      {
        key: "renewalRevenue",
        label: "…from renewals",
        money: true,
        where: `${TX_SCOPE} AND ${TX_RENEWAL} IS TRUE`,
        agg: sumOf(`t."totalAmount"`),
        shareOf: "lifetimeRevenue",
        metric: "payments",
        dimension: "paymentKind",
        dimensionValue: "renewal",
      },
      { key: "payments", label: "Payments", where: TX_SCOPE, metric: "payments" },
      {
        key: "payers",
        label: "People who have paid",
        where: TX_SCOPE,
        agg: countDistinct(`t."userId"`),
      },
    ],
  },
  {
    tables: ["withdrawals"],
    from: `withdrawals w`,
    dateCol: `COALESCE(w."requestedAt", w."createdAt")`,
    facts: [
      // Requested leads and Paid is the share OF it, not the other way round:
      // requested is always the larger of the two (some requests fail or are
      // still pending), and a "share" above 100% reads as a bug in the tile.
      {
        key: "withdrawalsRequested",
        label: "Payouts requested",
        money: true,
        agg: sumOf(`w."amountRupees"`),
        metric: "withdrawals",
      },
      {
        key: "withdrawalsPaid",
        label: "…actually paid out",
        money: true,
        where: `lower(COALESCE(w.status, '')) IN ('processed', 'completed', 'paid')`,
        agg: sumOf(`w."amountRupees"`),
        shareOf: "withdrawalsRequested",
        hint: "Every production payout is manual",
        metric: "withdrawals",
      },
      {
        key: "withdrawalPeople",
        label: "Creators paid",
        where: `lower(COALESCE(w.status, '')) IN ('processed', 'completed', 'paid')`,
        agg: countDistinct(`w."userId"`),
      },
    ],
  },
];

/**
 * GET /admin/creator-analytics/overview
 *
 * Optionally windowed. With no dates, every figure is all-time; with dates,
 * each fact reports the window and keeps its all-time total alongside.
 */
export const getOverviewService = async (f: Partial<CreatorFilters> = {}) => {
  const windowed = Boolean(f.startDate && f.endDate);

  // Bound as literals rather than named binds because these predicates are
  // embedded inside FILTER clauses that are themselves built per fact — one
  // statement can carry forty of them, and Sequelize's named-replacement
  // scanner rewrites every occurrence, which makes the SQL far harder to read
  // back when it goes wrong. The values are Joi-validated `YYYY-MM-DD` strings
  // and nothing else can reach here.
  let win: { curr: string; prev: string } | null = null;
  let prevRange: { startDate: string; endDate: string } | null = null;

  if (windowed) {
    const range = { startDate: f.startDate!, endDate: f.endDate! };
    prevRange = previousPeriod(range as CreatorFilters);
    const between = (col: string, a: string, b: string) =>
      `${col} >= ('${a}'::date)::timestamp AT TIME ZONE 'Asia/Kolkata'
       AND ${col} < ('${b}'::date + 1)::timestamp AT TIME ZONE 'Asia/Kolkata'`;
    // `WINDOW_COL` is substituted per source below.
    win = {
      curr: between("WINDOW_COL", range.startDate, range.endDate),
      prev: between("WINDOW_COL", prevRange.startDate, prevRange.endDate),
    };
  }

  /** Substitutes each source's own date column into the shared predicates. */
  const winFor = (src: FactSource) => {
    if (!win || !src.dateCol) return null;
    // `split/join`, not `replaceAll` — this project targets ES2020 — and not
    // `replace(/…/g, col)` either, because a date column can legitimately
    // contain `$` sequences that a regex replacement would interpret.
    const sub = (t: string) => t.split("WINDOW_COL").join(src.dateCol!);
    return { curr: sub(win.curr), prev: sub(win.prev) };
  };

  const section = async (
    key: string,
    title: string,
    sub: string,
    sources: FactSource[],
  ) => {
    const present = await tablesExist([...new Set(sources.flatMap((s) => s.tables))]);
    const usable = sources.filter((s) => s.tables.every((t) => present[t]));
    const results = await Promise.all(usable.map((s) => runSource(s, winFor(s))));
    const raw: Record<string, { all: number; win: number; prev: number }> = {};
    for (const r of results) Object.assign(raw, r);
    // A source with no date column reports all-time even under a window, and
    // `allTimeOnly` on its facts is what tells the UI to say so.
    const specs = usable.flatMap((s) =>
      s.dateCol ? s.facts : s.facts.map((fa) => ({ ...fa, allTimeOnly: true })),
    );
    return { key, title, sub, facts: resolve(specs, raw, windowed) };
  };

  const [catalogue, people, activity, money, coverage] = await Promise.all([
    section("catalogue", "Catalogue", "What there is to license", catalogueSources()),
    peopleSources().then((s) =>
      section("people", "People", "Who is on the platform, and where they came from", s),
    ),
    section(
      "activity",
      "What creators have done",
      "Downloads, favourites, collections and the creator programme",
      activitySources(),
    ),
    section("money", "Money", "Subscription revenue in, creator payouts out", moneySources()),
    captureStart(),
  ]);

  return {
    windowed,
    range: windowed ? { startDate: f.startDate!, endDate: f.endDate! } : null,
    previousRange: prevRange,
    sections: [catalogue, people, activity, money],
    coverage: { sessionsFrom: coverage },
    notes: {
      origin: ORIGIN_NOTE,
      revenue: REVENUE_NOTE,
      window:
        "With a window applied, each figure shows what happened INSIDE it and " +
        "keeps its all-time total underneath. A few — live subscriptions, " +
        "playlist placements, creator profiles — have no date to window by and " +
        "stay all-time; they are labelled as such.",
    },
  };
};
