// ─── Platform overview ───────────────────────────────────────────────────────
//
// What the platform IS, right now: how much catalogue there is, how many people
// are on it, what they have made, and what has been collected — all-time,
// as of this moment.
//
// ── THIS VIEW IGNORES THE DATE RANGE, DELIBERATELY ──────────────────────────
//
// Every other view in this module is windowed. This one is not, and that is the
// whole point of it existing separately rather than as another row of tiles on
// Activity. "How many tracks do we have" has no date in it; answering it with
// "how many did we add in the last 30 days" while labelling it "Tracks" is the
// single most misleading thing this dashboard could do. Activity already
// answers the windowed version of each of these — the same metric key, the same
// drill-down — so nothing is lost by keeping this one absolute.
//
// The payload says so in `windowed: false`, and the UI hides the range bar.
//
// ── ONE STATEMENT PER SECTION, NOT PER FACT ─────────────────────────────────
//
// Thirty-odd facts as thirty-odd queries would be thirty round trips for a page
// that is read at a glance. They are grouped into a handful of statements, each
// a single scan of one table with FILTER clauses for its sub-counts — so
// "Tracks: 22,787 / 14,129 live music / 6,109 live SFX" costs one pass over
// `tracks`, not three.
//
// ── EVERY FACT THAT CAN OPEN, OPENS ─────────────────────────────────────────
//
// A fact carries the registry metric and, where it is a sub-count, the
// dimension bucket that reproduces it — so clicking "Live SFX" lands on the
// SFX rows and not on the whole catalogue. Facts with no drillable equivalent
// (a sum of money, a count of a table with no metric) carry none rather than a
// link that silently shows something else.

import {
  q,
  num,
  pct,
  tableExists,
  tablesExist,
  creatorUsersCte,
  captureStart,
  TX_SCOPE,
  TX_RENEWAL,
  ORIGIN_LABELS,
  ORIGINS,
  ORIGIN_NOTE,
  REVENUE_NOTE,
} from "./creator-analytics-shared";

const round2 = (v: unknown): number => Math.round(num(v) * 100) / 100;

/** One number on the overview. */
export interface OverviewFact {
  key: string;
  label: string;
  value: number;
  /** Rendered as rupees rather than a plain count. */
  money?: boolean;
  hint?: string;
  /** The registry metric this opens, if any. */
  metric?: string;
  /** Narrows that drill-down to the bucket this fact counts. */
  dimension?: string;
  dimensionValue?: string;
  /** Share of the section's headline figure, when it is a sub-count. */
  sharePct?: number;
}

export interface OverviewSection {
  key: string;
  title: string;
  sub: string;
  facts: OverviewFact[];
}

/**
 * A section whose tables are missing entirely.
 *
 * Reported rather than thrown, for the same reason the metric registry does it:
 * staging lacks several of these, and a page that 500s because one optional
 * table is absent is worse than one that says "not recorded here".
 */
const emptySection = (
  key: string,
  title: string,
  sub: string,
  missing: string,
): OverviewSection => ({
  key,
  title,
  sub: `${sub} — not recorded here (missing \`${missing}\`)`,
  facts: [],
});

/** The catalogue: tracks, stems, artists, albums, Hoopr playlists. */
const catalogueSection = async (): Promise<OverviewSection> => {
  const present = await tablesExist([
    "tracks",
    "creator_stems",
    "artists",
    "albums",
    "playlists",
    "track_playlist_mappings",
  ]);

  if (!present.tracks) {
    return emptySection("catalogue", "Catalogue", "What there is to license", "tracks");
  }

  const [tracks, stems, artists, albums, playlists] = await Promise.all([
    q<Record<string, string>>(
      `SELECT count(*)::bigint                                                       AS total,
              count(*) FILTER (WHERE x.status = 'ACTIVE')::bigint                    AS active,
              count(*) FILTER (WHERE x.status = 'ACTIVE' AND x.type = 'music')::bigint AS active_music,
              count(*) FILTER (WHERE x.status = 'ACTIVE' AND x.type = 'sfx')::bigint   AS active_sfx,
              count(*) FILTER (WHERE x.status <> 'ACTIVE')::bigint                   AS retired,
              count(*) FILTER (WHERE x."hasVocals")::bigint                          AS vocals,
              count(*) FILTER (WHERE x."hasVocals" IS NOT TRUE)::bigint              AS instrumental
         FROM tracks x`,
    ),
    present.creator_stems
      ? q<{ total: string; tracks_with_stems: string }>(
          `SELECT count(*)::bigint AS total,
                  count(DISTINCT x.track_id)::bigint AS tracks_with_stems
             FROM creator_stems x WHERE x.deleted IS NULL`,
        )
      : Promise.resolve([]),
    present.artists
      ? q<{ total: string; active: string; native: string }>(
          `SELECT count(*)::bigint AS total,
                  count(*) FILTER (WHERE x.status = 'ACTIVE')::bigint AS active,
                  count(*) FILTER (WHERE x."nativeArtist")::bigint    AS native
             FROM artists x`,
        )
      : Promise.resolve([]),
    present.albums
      ? q<{ total: string }>(
          `SELECT count(*)::bigint AS total FROM albums x WHERE x.deleted IS NULL`,
        )
      : Promise.resolve([]),
    present.playlists
      ? q<Record<string, string>>(
          `SELECT count(*)::bigint                                         AS total,
                  count(*) FILTER (WHERE x.status = 'ACTIVE')::bigint      AS active,
                  ${
                    present.track_playlist_mappings
                      ? `(SELECT count(*)::bigint FROM track_playlist_mappings)`
                      : `0::bigint`
                  }                                                        AS placements
             FROM playlists x`,
        )
      : Promise.resolve([]),
  ]);

  const t = tracks[0] ?? {};
  const total = num(t.total);
  const facts: OverviewFact[] = [
    {
      key: "tracks",
      label: "Tracks",
      value: total,
      hint: "Everything in the catalogue, live and retired",
      metric: "tracks",
    },
    {
      key: "activeMusic",
      label: "Live music",
      value: num(t.active_music),
      sharePct: pct(num(t.active_music), total),
      metric: "tracks",
      dimension: "type",
      dimensionValue: "music",
    },
    {
      key: "activeSfx",
      label: "Live SFX",
      value: num(t.active_sfx),
      sharePct: pct(num(t.active_sfx), total),
      metric: "tracks",
      dimension: "type",
      dimensionValue: "sfx",
    },
    {
      key: "retiredTracks",
      label: "Retired",
      value: num(t.retired),
      sharePct: pct(num(t.retired), total),
      hint: "Not ACTIVE — still in the catalogue, not offered",
      metric: "tracks",
    },
    {
      key: "vocalTracks",
      label: "With vocals",
      value: num(t.vocals),
      sharePct: pct(num(t.vocals), total),
      metric: "tracks",
      dimension: "vocals",
      dimensionValue: "With vocals",
    },
    {
      key: "instrumentalTracks",
      label: "Instrumental",
      value: num(t.instrumental),
      sharePct: pct(num(t.instrumental), total),
      metric: "tracks",
      dimension: "vocals",
      dimensionValue: "Instrumental",
    },
  ];

  if (stems.length) {
    facts.push(
      {
        key: "stems",
        label: "Stems",
        value: num(stems[0].total),
        hint: "Multitrack layers, soft-deleted ones excluded",
        metric: "stems",
      },
      {
        key: "tracksWithStems",
        label: "Tracks with stems",
        value: num(stems[0].tracks_with_stems),
        sharePct: pct(num(stems[0].tracks_with_stems), total),
      },
    );
  }
  if (artists.length) {
    facts.push(
      { key: "artists", label: "Artists", value: num(artists[0].total), metric: "artists" },
      {
        key: "nativeArtists",
        label: "With a Creator page",
        value: num(artists[0].native),
        hint: "Artists surfaced on creator-web, not just credited",
        metric: "artists",
      },
    );
  }
  if (albums.length) {
    facts.push({
      key: "albums",
      label: "Albums",
      value: num(albums[0].total),
      metric: "albums",
    });
  }
  if (playlists.length) {
    facts.push(
      {
        key: "hooprPlaylists",
        label: "Hoopr playlists",
        value: num(playlists[0].total),
        hint: "Curated and system playlists — not creators' own collections",
        metric: "hooprPlaylists",
      },
      {
        key: "activeHooprPlaylists",
        label: "Live playlists",
        value: num(playlists[0].active),
        metric: "hooprPlaylists",
        dimension: "status",
        dimensionValue: "ACTIVE",
      },
      {
        key: "playlistPlacements",
        label: "Tracks in playlists",
        value: num(playlists[0].placements),
        hint: "Placements, not distinct tracks — one track can sit in several",
      },
    );
  }

  return {
    key: "catalogue",
    title: "Catalogue",
    sub: "What there is to license",
    facts,
  };
};

/** People: accounts, where they came from, who is subscribed. */
const peopleSection = async (): Promise<OverviewSection> => {
  const usersCte = await creatorUsersCte();
  const [profilesPresent, subsPresent] = await Promise.all([
    tableExists("soundtracking_user_profiles"),
    tableExists("user_subscriptions"),
  ]);

  const [accounts, byOrigin, subs, profiles] = await Promise.all([
    q<Record<string, string>>(
      `WITH ${usersCte}
       SELECT count(*)::bigint                                          AS total,
              count(*) FILTER (WHERE cu.status = 'ACTIVE')::bigint      AS active,
              count(*) FILTER (WHERE cu.status = 'DELETED')::bigint     AS deleted,
              count(*) FILTER (WHERE cu.email IS NOT NULL)::bigint      AS with_email,
              count(*) FILTER (WHERE cu.mobile IS NOT NULL)::bigint     AS with_mobile
         FROM creator_users cu`,
    ),
    q<{ origin: string; n: string }>(
      `WITH ${usersCte}
       SELECT cu.origin, count(*)::bigint AS n FROM creator_users cu GROUP BY 1`,
    ),
    subsPresent
      ? q<Record<string, string>>(
          `SELECT count(*)::bigint                                                   AS total,
                  count(*) FILTER (WHERE s.status IN ('active', 'past_due'))::bigint AS live,
                  count(DISTINCT s."userId")
                    FILTER (WHERE s.status IN ('active', 'past_due'))::bigint        AS live_people,
                  count(*) FILTER (
                    WHERE s.status IN ('active', 'past_due')
                      AND (s."razorpaySubscriptionId" IS NOT NULL
                           OR s."appleOriginalTxId" IS NOT NULL)
                  )::bigint                                                          AS live_paid
             FROM user_subscriptions s`,
        )
      : Promise.resolve([]),
    profilesPresent
      ? q<{ total: string }>(
          `SELECT count(*)::bigint AS total FROM soundtracking_user_profiles`,
        )
      : Promise.resolve([]),
  ]);

  const a = accounts[0] ?? {};
  const total = num(a.total);
  const originCounts = new Map(byOrigin.map((r) => [r.origin, num(r.n)]));

  const facts: OverviewFact[] = [
    {
      key: "creators",
      label: "Creator accounts",
      value: total,
      hint: "Every account on the CREATOR platform",
      metric: "signups",
    },
    {
      key: "activeCreators",
      label: "Active",
      value: num(a.active),
      sharePct: pct(num(a.active), total),
      metric: "signups",
    },
    {
      key: "deactivatedCreators",
      label: "Deactivated",
      value: num(a.deleted),
      sharePct: pct(num(a.deleted), total),
      metric: "signups",
    },
    ...ORIGINS.map((o) => ({
      key: `origin${o}`,
      label: ORIGIN_LABELS[o],
      value: originCounts.get(o) ?? 0,
      sharePct: pct(originCounts.get(o) ?? 0, total),
      // Read WEB as "no app evidence" — see ORIGIN_NOTE, which the UI prints
      // under this section rather than hiding in a tooltip.
      hint:
        o === "WEB"
          ? "No app evidence — includes every account the legacy migration bulk-loaded"
          : undefined,
      metric: "signups",
      dimension: "origin",
      dimensionValue: o,
    })),
  ];

  if (subs.length) {
    const s = subs[0];
    facts.push(
      {
        key: "liveSubscriptions",
        label: "Live subscriptions",
        value: num(s.live),
        hint: "active + past_due — both still have the product",
        metric: "subscriptions",
      },
      {
        key: "liveSubscribers",
        label: "Subscribers",
        value: num(s.live_people),
        sharePct: pct(num(s.live_people), total),
        hint: "Distinct people holding a live plan",
      },
      {
        key: "livePaidSubscriptions",
        label: "…with a payment instrument",
        value: num(s.live_paid),
        hint: "A Razorpay mandate or an Apple receipt behind the row; the rest are comped",
      },
      {
        key: "allSubscriptions",
        label: "Subscriptions ever",
        value: num(s.total),
        metric: "subscriptions",
      },
    );
  }
  if (profiles.length) {
    facts.push({
      key: "creatorProfiles",
      label: "Creator profiles",
      value: num(profiles[0].total),
      hint: "Accounts that have filled in a soundtracking profile",
    });
  }

  return {
    key: "people",
    title: "People",
    sub: "Who is on the platform, and where they came from",
    facts,
  };
};

/** What creators have made and saved, all-time. */
const activitySection = async (): Promise<OverviewSection> => {
  const t = await tablesExist([
    "licenses",
    "user_liked_tracks",
    "creator_liked_playlists",
    "collections",
    "collection_items",
    "sound_projects",
    "video_links",
    "native_shares",
    "native_referrals",
  ]);

  const one = async <T extends Record<string, string>>(
    table: string,
    sql: string,
  ): Promise<T[]> => (t[table] ? q<T>(sql) : Promise.resolve([]));

  const [downloads, likes, playlistLikes, collections, projects, claims, shares, referrals] =
    await Promise.all([
      one<Record<string, string>>(
        "licenses",
        `SELECT count(*)::bigint AS total,
                count(DISTINCT x."userId")::bigint AS people,
                count(*) FILTER (WHERE x.type = 'stem')::bigint AS stems
           FROM licenses x
          WHERE lower(COALESCE(x.status, 'active')) <> 'pending'`,
      ),
      one<Record<string, string>>(
        "user_liked_tracks",
        `SELECT count(*)::bigint AS total, count(DISTINCT x."userId")::bigint AS people
           FROM user_liked_tracks x`,
      ),
      one<Record<string, string>>(
        "creator_liked_playlists",
        `SELECT count(*)::bigint AS total, count(DISTINCT x.user_id)::bigint AS people
           FROM creator_liked_playlists x WHERE x.liked IS TRUE`,
      ),
      one<Record<string, string>>(
        "collections",
        `SELECT count(*)::bigint AS total,
                count(DISTINCT x."userId")::bigint AS people,
                ${
                  t.collection_items
                    ? `(SELECT count(*)::bigint FROM collection_items)`
                    : `0::bigint`
                } AS items
           FROM collections x
          WHERE COALESCE(x.status, 'ACTIVE') <> 'DELETED'`,
      ),
      one<Record<string, string>>(
        "sound_projects",
        `SELECT count(*)::bigint AS total, count(DISTINCT x."userId")::bigint AS people
           FROM sound_projects x`,
      ),
      one<Record<string, string>>(
        "video_links",
        `SELECT count(*)::bigint AS total, count(DISTINCT x."userId")::bigint AS people
           FROM video_links x`,
      ),
      one<Record<string, string>>(
        "native_shares",
        `SELECT count(*)::bigint AS total,
                count(*) FILTER (WHERE x."userId" IS NULL)::bigint AS anonymous,
                COALESCE(sum(x."clickCount"), 0)::bigint AS clicks
           FROM native_shares x`,
      ),
      one<Record<string, string>>(
        "native_referrals",
        `SELECT count(*)::bigint AS total,
                count(*) FILTER (WHERE x.status = 'COMPLETED')::bigint AS completed
           FROM native_referrals x`,
      ),
    ]);

  const facts: OverviewFact[] = [];

  if (downloads.length) {
    facts.push(
      {
        key: "downloads",
        label: "Downloads",
        value: num(downloads[0].total),
        hint: "One licence row per export, all-time",
        metric: "downloads",
      },
      {
        key: "stemDownloads",
        label: "…of stems",
        value: num(downloads[0].stems),
        sharePct: pct(num(downloads[0].stems), num(downloads[0].total)),
        metric: "downloads",
        dimension: "assetType",
        dimensionValue: "stem",
      },
      {
        key: "downloaders",
        label: "People who downloaded",
        value: num(downloads[0].people),
      },
    );
  }
  if (likes.length) {
    facts.push(
      {
        key: "likes",
        label: "Tracks favourited",
        value: num(likes[0].total),
        metric: "likes",
      },
      { key: "likers", label: "People who favourited", value: num(likes[0].people) },
    );
  }
  if (playlistLikes.length) {
    facts.push({
      key: "playlistLikes",
      label: "Playlists favourited",
      value: num(playlistLikes[0].total),
      metric: "playlistLikes",
    });
  }
  if (collections.length) {
    facts.push(
      {
        key: "collections",
        label: "Creator collections",
        value: num(collections[0].total),
        hint: "Creators' OWN playlists — not the curated Hoopr ones",
        metric: "collections",
      },
      {
        key: "collectionItems",
        label: "Tracks saved into them",
        value: num(collections[0].items),
        metric: "collectionItems",
      },
    );
  }
  if (projects.length) {
    facts.push({
      key: "projects",
      label: "Video projects",
      value: num(projects[0].total),
      hint: "Editor sessions in the app",
      metric: "projects",
    });
  }
  if (claims.length) {
    facts.push({
      key: "claims",
      label: "Reel claims",
      value: num(claims[0].total),
      metric: "claims",
    });
  }
  if (shares.length) {
    facts.push(
      {
        key: "shares",
        label: "Shares",
        value: num(shares[0].total),
        hint: "Includes anonymous shares, which the per-person drill-down cannot show",
        metric: "shares",
      },
      {
        key: "shareClicks",
        label: "Clicks on shares",
        value: num(shares[0].clicks),
      },
    );
  }
  if (referrals.length) {
    facts.push(
      {
        key: "referrals",
        label: "Referrals",
        value: num(referrals[0].total),
        metric: "referrals",
      },
      {
        key: "completedReferrals",
        label: "…completed",
        value: num(referrals[0].completed),
        metric: "referrals",
        dimension: "status",
        dimensionValue: "COMPLETED",
      },
    );
  }

  return {
    key: "activity",
    title: "What creators have done",
    sub: "All-time, across app and web",
    facts,
  };
};

/** Lifetime money in and money out. */
const moneySection = async (): Promise<OverviewSection> => {
  const t = await tablesExist(["transactions", "withdrawals"]);
  if (!t.transactions && !t.withdrawals) {
    return emptySection("money", "Money", "Lifetime, all-time", "transactions");
  }

  const [revenue, payouts] = await Promise.all([
    t.transactions
      ? q<Record<string, string>>(
          `SELECT count(*)::bigint                                            AS payments,
                  count(DISTINCT t."userId")::bigint                          AS payers,
                  COALESCE(sum(t."totalAmount"), 0)                           AS gross,
                  COALESCE(sum(t."totalAmount") FILTER (WHERE ${TX_RENEWAL} IS TRUE), 0) AS renewal_gross,
                  count(*) FILTER (WHERE ${TX_RENEWAL} IS TRUE)::bigint       AS renewals
             FROM transactions t
            WHERE ${TX_SCOPE}`,
        )
      : Promise.resolve([]),
    t.withdrawals
      ? q<Record<string, string>>(
          `SELECT count(*)::bigint AS requests,
                  count(DISTINCT w."userId")::bigint AS people,
                  COALESCE(sum(w."amountRupees"), 0) AS requested,
                  COALESCE(sum(w."amountRupees") FILTER (
                    WHERE lower(COALESCE(w.status, '')) IN ('processed', 'completed', 'paid')
                  ), 0) AS paid
             FROM withdrawals w`,
        )
      : Promise.resolve([]),
  ]);

  const facts: OverviewFact[] = [];

  if (revenue.length) {
    const r = revenue[0];
    facts.push(
      {
        key: "lifetimeRevenue",
        label: "Subscription revenue",
        value: round2(r.gross),
        money: true,
        hint: "All-time plan-cycle money that arrived, legacy backfill included",
        metric: "payments",
      },
      {
        key: "renewalRevenue",
        label: "…from renewals",
        value: round2(r.renewal_gross),
        money: true,
        sharePct: pct(round2(r.renewal_gross), round2(r.gross)),
        metric: "payments",
        dimension: "paymentKind",
        dimensionValue: "renewal",
      },
      { key: "payments", label: "Payments", value: num(r.payments), metric: "payments" },
      { key: "payers", label: "People who have paid", value: num(r.payers) },
    );
  }
  if (payouts.length) {
    const w = payouts[0];
    facts.push(
      {
        key: "withdrawalsPaid",
        label: "Paid out to creators",
        value: round2(w.paid),
        money: true,
        hint: "Every production payout is manual",
        metric: "withdrawals",
      },
      {
        key: "withdrawalsRequested",
        label: "Requested",
        value: round2(w.requested),
        money: true,
        metric: "withdrawals",
      },
      {
        key: "withdrawalPeople",
        label: "Creators paid",
        value: num(w.people),
      },
    );
  }

  return { key: "money", title: "Money", sub: "Lifetime, all-time", facts };
};

/**
 * GET /admin/creator-analytics/overview
 *
 * Point-in-time platform totals. Takes no date range on purpose.
 */
export const getOverviewService = async () => {
  const [catalogue, people, activity, money, coverage] = await Promise.all([
    catalogueSection(),
    peopleSection(),
    activitySection(),
    moneySection(),
    captureStart(),
  ]);

  return {
    /** The UI hides the range bar on this view; the flag is why. */
    windowed: false,
    generatedFor: "all time",
    sections: [catalogue, people, activity, money],
    coverage: { sessionsFrom: coverage },
    notes: { origin: ORIGIN_NOTE, revenue: REVENUE_NOTE },
  };
};
