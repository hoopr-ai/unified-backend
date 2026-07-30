import {
  q,
  num,
  pct,
  round1,
  inRange,
  istDay,
  istWeek,
  istMonth,
  ACTIVE_BRANDS,
  HEALTH_NOW,
  customerPred,
  customerBrandJoin,
  isNativePack,
  type DateRange,
} from "./analytics-shared";

// ─── Founder dashboard ───────────────────────────────────────────────────────
// "Is the business healthy right now?" — one payload per section.

// A brand is "active" in a window when any of its users opened a session.
const brandActiveSince = (interval: string): string => `
  SELECT COUNT(DISTINCT u."brandId") AS count
  FROM user_sessions s
  JOIN users u ON u.id = s."userId" AND u."brandId" IS NOT NULL
  JOIN brands b ON b.id = u."brandId" AND ${customerPred("b")}
  WHERE s."createdAt" >= NOW() - INTERVAL '${interval}'`;

// Section 1 + 7 — customer overview KPIs and the health-mix donut.
export const getFounderOverviewService = async (range: DateRange) => {
  const [totals, active7, active30, newByMonth, weeklyActive, healthMix] =
    await Promise.all([
      q<{ total: string; new_in_range: string }>(
        `SELECT COUNT(*) AS total,
                COUNT(*) FILTER (WHERE ${inRange(`b."createdAt"`)}) AS new_in_range
         FROM ${ACTIVE_BRANDS}`,
        range,
      ),
      q<{ count: string }>(brandActiveSince("7 days")),
      q<{ count: string }>(brandActiveSince("30 days")),
      q<{ month: string; count: string }>(
        `SELECT ${istMonth(`b."createdAt"`)} AS month, COUNT(*) AS count
         FROM ${ACTIVE_BRANDS} AND b."createdAt" >= NOW() - INTERVAL '12 months'
         GROUP BY 1 ORDER BY 1`,
      ),
      q<{ week: string; count: string }>(
        `SELECT ${istWeek(`s."createdAt"`)} AS week,
                COUNT(DISTINCT u."brandId") AS count
         FROM user_sessions s
         JOIN users u ON u.id = s."userId" AND u."brandId" IS NOT NULL
         JOIN brands b ON b.id = u."brandId" AND ${customerPred("b")}
         WHERE s."createdAt" >= NOW() - INTERVAL '12 weeks'
         GROUP BY 1 ORDER BY 1`,
      ),
      q<{ tier: string; count: string }>(
        `WITH ${HEALTH_NOW}
         SELECT tier, COUNT(*) AS count FROM health_banded GROUP BY tier`,
      ),
    ]);

  const mix = { HEALTHY: 0, MODERATE: 0, AT_RISK: 0 } as Record<string, number>;
  for (const row of healthMix) mix[row.tier] = num(row.count);

  return {
    totalBrands: num(totals[0]?.total),
    newBrandsInRange: num(totals[0]?.new_in_range),
    activeBrands7d: num(active7[0]?.count),
    activeBrands30d: num(active30[0]?.count),
    newBrandsByMonth: newByMonth.map((r) => ({ month: r.month, count: num(r.count) })),
    weeklyActiveBrands: weeklyActive.map((r) => ({ week: r.week, count: num(r.count) })),
    healthMix: {
      healthy: mix.HEALTHY,
      moderate: mix.MODERATE,
      atRisk: mix.AT_RISK,
    },
  };
};

// Section 2 — token economics. Unlimited packs are excluded from every number.
export const getFounderTokenEconomicsService = async (range: DateRange) => {
  const [issued, consumed, reels, series, nearingDepletion, nativeOnly] =
    await Promise.all([
      // Packs currently in force: not expired, finite.
      q<{ issued: string; balance: string; brands: string }>(
        `SELECT COALESCE(SUM(ta."totalAssignedToken"), 0) AS issued,
                COALESCE(SUM(ta."tokenBalance"), 0) AS balance,
                COUNT(DISTINCT ta."brandId") AS brands
         FROM token_assigned ta
         JOIN brands b ON b.id = ta."brandId" AND ${customerPred("b")}
         WHERE ta."isUnlimited" IS NOT TRUE
           AND (ta."expiryDate" IS NULL OR ta."expiryDate" >= NOW())`,
      ),
      q<{ consumed: string }>(
        `SELECT COALESCE(SUM(td."deductedTokenCount"), 0) AS consumed
         FROM token_deduction td
         JOIN token_assigned ta ON ta.id = td."tokenAssignedId" AND ta."isUnlimited" IS NOT TRUE
         ${customerBrandJoin('ta."brandId"')}
         WHERE ${inRange(`td."deductedAt"`)}`,
        range,
      ),
      q<{ reels: string }>(
        `SELECT COUNT(*) AS reels
         FROM video_links vl
         ${customerBrandJoin('vl."brandId"')}
         WHERE ${inRange(`vl."createdAt"`)}`,
        range,
      ),
      q<{ day: string; consumed: string }>(
        `SELECT ${istDay(`td."deductedAt"`)} AS day,
                COALESCE(SUM(td."deductedTokenCount"), 0) AS consumed
         FROM token_deduction td
         JOIN token_assigned ta ON ta.id = td."tokenAssignedId" AND ta."isUnlimited" IS NOT TRUE
         ${customerBrandJoin('ta."brandId"')}
         WHERE ${inRange(`td."deductedAt"`)}
         GROUP BY 1 ORDER BY 1`,
        range,
      ),
      // Fewer than 15 non-Native tokens left overall on in-force packs.
      // Native (Hoopr Originals) packs are ignored entirely, and brands with
      // an in-force unlimited pack can't deplete.
      q<{
        brand_id: string; brand_name: string; issued: string; balance: string;
        utilization: string; expiry: string | null;
      }>(
        `SELECT ta."brandId" AS brand_id, b.name AS brand_name,
                SUM(ta."totalAssignedToken") AS issued,
                SUM(ta."tokenBalance") AS balance,
                ROUND(100.0 * (SUM(ta."totalAssignedToken") - SUM(ta."tokenBalance"))
                      / NULLIF(SUM(ta."totalAssignedToken"), 0), 1) AS utilization,
                MIN(ta."expiryDate") AS expiry
         FROM token_assigned ta
         JOIN brands b ON b.id = ta."brandId" AND ${customerPred("b")}
         WHERE ta."isUnlimited" IS NOT TRUE
           AND NOT ${isNativePack("ta")}
           AND (ta."expiryDate" IS NULL OR ta."expiryDate" >= NOW())
         GROUP BY 1, 2
         HAVING SUM(ta."totalAssignedToken") > 0
            AND SUM(ta."tokenBalance") < 15
            AND NOT EXISTS (
              SELECT 1 FROM token_assigned ux
              WHERE ux."brandId" = ta."brandId"
                AND ux."isUnlimited" IS TRUE
                AND (ux."expiryDate" IS NULL OR ux."expiryDate" >= NOW())
            )
         ORDER BY balance ASC, brand_name ASC`,
      ),
      // Brands whose every in-force pack is Native (Hoopr Originals) — they
      // have tokens but only for the Native catalogue.
      q<{
        brand_id: string; brand_name: string; issued: string; balance: string;
        expiry: string | null;
      }>(
        `SELECT ta."brandId" AS brand_id, b.name AS brand_name,
                SUM(ta."totalAssignedToken") AS issued,
                SUM(ta."tokenBalance") AS balance,
                MIN(ta."expiryDate") AS expiry
         FROM token_assigned ta
         JOIN brands b ON b.id = ta."brandId" AND ${customerPred("b")}
         WHERE (ta."expiryDate" IS NULL OR ta."expiryDate" >= NOW())
         GROUP BY 1, 2
         HAVING BOOL_AND(${isNativePack("ta")})
         ORDER BY balance DESC, brand_name ASC`,
      ),
    ]);

  const totalIssued = num(issued[0]?.issued);
  const totalBalance = num(issued[0]?.balance);

  return {
    totalTokensIssued: totalIssued,
    totalTokenBalance: totalBalance,
    brandsWithActivePacks: num(issued[0]?.brands),
    tokensConsumedInRange: num(consumed[0]?.consumed),
    reelsPostedInRange: num(reels[0]?.reels),
    consumptionSeries: series.map((r) => ({ day: r.day, consumed: num(r.consumed) })),
    avgKittyUtilizationPct: pct(totalIssued - totalBalance, totalIssued),
    brandsNearingDepletion: nearingDepletion.map((r) => ({
      brandId: num(r.brand_id),
      brandName: r.brand_name,
      tokensIssued: num(r.issued),
      tokensLeft: num(r.balance),
      utilizationPct: num(r.utilization),
      expiryDate: r.expiry,
    })),
    brandsWithOnlyNativeTokens: nativeOnly.map((r) => ({
      brandId: num(r.brand_id),
      brandName: r.brand_name,
      tokensIssued: num(r.issued),
      tokensLeft: num(r.balance),
      expiryDate: r.expiry,
    })),
  };
};

// Section 3 — adoption funnel, all-time, one row per active brand.
// "First Search" is bounded by brand_search_history's 90-day purge, so it
// only reflects brands that searched within the last ~3 months.
export const getFounderFunnelService = async () => {
  const [stages, timings] = await Promise.all([
    q<{
      onboarded: string; first_login: string; first_search: string;
      first_preview: string; first_download: string; first_reel: string;
      monthly_active: string;
    }>(
      `WITH brand_flags AS (
         SELECT
           b.id,
           EXISTS (SELECT 1 FROM users u JOIN user_sessions s ON s."userId" = u.id
                   WHERE u."brandId" = b.id) AS logged_in,
           EXISTS (SELECT 1 FROM brand_search_history sh WHERE sh."brandId" = b.id) AS searched,
           EXISTS (SELECT 1 FROM users u JOIN user_stream_history ush ON ush."userId" = u.id
                   WHERE u."brandId" = b.id AND ush."streamType" IN ('PREVIEW', 'PLAY')) AS previewed,
           EXISTS (SELECT 1 FROM licenses l WHERE l."brandId" = b.id) AS downloaded,
           EXISTS (SELECT 1 FROM video_links vl WHERE vl."brandId" = b.id) AS reeled,
           EXISTS (SELECT 1 FROM users u JOIN user_sessions s ON s."userId" = u.id
                   WHERE u."brandId" = b.id
                     AND s."createdAt" >= NOW() - INTERVAL '30 days') AS monthly_active
         FROM ${ACTIVE_BRANDS}
       )
       SELECT COUNT(*) AS onboarded,
              COUNT(*) FILTER (WHERE logged_in) AS first_login,
              COUNT(*) FILTER (WHERE searched) AS first_search,
              COUNT(*) FILTER (WHERE previewed) AS first_preview,
              COUNT(*) FILTER (WHERE downloaded) AS first_download,
              COUNT(*) FILTER (WHERE reeled) AS first_reel,
              COUNT(*) FILTER (WHERE monthly_active) AS monthly_active
       FROM brand_flags`,
    ),
    q<{ median_days_to_first_download: string | null; median_days_download_to_reel: string | null }>(
      `WITH firsts AS (
         SELECT b.id,
                b."createdAt" AS onboarded_at,
                (SELECT MIN(l."licensedAt") FROM licenses l WHERE l."brandId" = b.id) AS first_download,
                (SELECT MIN(vl."createdAt") FROM video_links vl WHERE vl."brandId" = b.id) AS first_reel
         FROM ${ACTIVE_BRANDS}
       )
       SELECT
         percentile_cont(0.5) WITHIN GROUP (ORDER BY
           EXTRACT(EPOCH FROM (first_download - onboarded_at)) / 86400)
           FILTER (WHERE first_download IS NOT NULL AND first_download >= onboarded_at)
           AS median_days_to_first_download,
         percentile_cont(0.5) WITHIN GROUP (ORDER BY
           EXTRACT(EPOCH FROM (first_reel - first_download)) / 86400)
           FILTER (WHERE first_reel IS NOT NULL AND first_download IS NOT NULL)
           AS median_days_download_to_reel
       FROM firsts`,
    ),
  ]);

  const s = stages[0];
  const stageList = [
    { stage: "Onboarded", count: num(s?.onboarded) },
    { stage: "First Login", count: num(s?.first_login) },
    { stage: "First Search (90d)", count: num(s?.first_search) },
    { stage: "First Preview", count: num(s?.first_preview) },
    { stage: "First Download", count: num(s?.first_download) },
    { stage: "First Reel Submitted", count: num(s?.first_reel) },
    { stage: "Monthly Active", count: num(s?.monthly_active) },
  ].map((row, i, all) => ({
    ...row,
    conversionFromPrev: i === 0 ? 100 : pct(row.count, all[i - 1].count),
  }));

  return {
    stages: stageList,
    medianDaysToFirstTokenSpend:
      timings[0]?.median_days_to_first_download === null
        ? null
        : round1(num(timings[0]?.median_days_to_first_download)),
    medianDaysDownloadToReel:
      timings[0]?.median_days_download_to_reel === null
        ? null
        : round1(num(timings[0]?.median_days_download_to_reel)),
  };
};

// Section 4 — engagement: weekly actives, tokens spent, reels, per-brand depth.
export const getFounderEngagementService = async (range: DateRange) => {
  const [activeSeries, tokenSeries, reelSeries, perBrand] = await Promise.all([
    q<{ week: string; weekly_brands: string }>(
      `SELECT ${istWeek(`s."createdAt"`)} AS week,
              COUNT(DISTINCT u."brandId") AS weekly_brands
       FROM user_sessions s
       JOIN users u ON u.id = s."userId" AND u."brandId" IS NOT NULL
       JOIN brands b ON b.id = u."brandId" AND ${customerPred("b")}
       WHERE ${inRange(`s."createdAt"`)}
       GROUP BY 1 ORDER BY 1`,
      range,
    ),
    q<{ week: string; tokens: string }>(
      `SELECT ${istWeek(`td."deductedAt"`)} AS week,
              COALESCE(SUM(td."deductedTokenCount"), 0) AS tokens
       FROM token_deduction td
       JOIN token_assigned ta ON ta.id = td."tokenAssignedId"
       ${customerBrandJoin('ta."brandId"')}
       WHERE ${inRange(`td."deductedAt"`)}
       GROUP BY 1 ORDER BY 1`,
      range,
    ),
    q<{ week: string; reels: string }>(
      `SELECT ${istWeek(`vl."createdAt"`)} AS week, COUNT(*) AS reels
       FROM video_links vl
       ${customerBrandJoin('vl."brandId"')}
       WHERE ${inRange(`vl."createdAt"`)}
       GROUP BY 1 ORDER BY 1`,
      range,
    ),
    q<{ brand_id: string; tokens: string; reels: string }>(
      `SELECT b.id AS brand_id,
              COALESCE((SELECT SUM(td."deductedTokenCount")
                        FROM token_deduction td
                        JOIN token_assigned ta ON ta.id = td."tokenAssignedId"
                        WHERE ta."brandId" = b.id AND ${inRange(`td."deductedAt"`)}), 0) AS tokens,
              (SELECT COUNT(*) FROM video_links vl
               WHERE vl."brandId" = b.id AND ${inRange(`vl."createdAt"`)}) AS reels
       FROM ${ACTIVE_BRANDS}`,
      range,
    ),
  ]);

  const tokensPerBrand = perBrand.map((r) => num(r.tokens));
  const reelsPerBrand = perBrand.map((r) => num(r.reels));
  const engaged = perBrand.filter((r) => num(r.tokens) > 0 || num(r.reels) > 0);

  const bucketize = (values: number[], bounds: number[]): { bucket: string; count: number }[] => {
    const labels = [
      "0",
      ...bounds.map((b, i) => (i === 0 ? `1-${b}` : `${bounds[i - 1] + 1}-${b}`)),
      `${bounds[bounds.length - 1] + 1}+`,
    ];
    const counts = new Array(labels.length).fill(0);
    for (const v of values) {
      if (v === 0) counts[0]++;
      else {
        const idx = bounds.findIndex((b) => v <= b);
        counts[idx === -1 ? labels.length - 1 : idx + 1]++;
      }
    }
    return labels.map((bucket, i) => ({ bucket, count: counts[i] }));
  };

  const totalTokens = tokensPerBrand.reduce((a, v) => a + v, 0);
  const totalReels = reelsPerBrand.reduce((a, v) => a + v, 0);

  return {
    weeklyActiveBrands: activeSeries.map((r) => ({ week: r.week, count: num(r.weekly_brands) })),
    tokensSpentSeries: tokenSeries.map((r) => ({ week: r.week, tokens: num(r.tokens) })),
    reelsSubmittedSeries: reelSeries.map((r) => ({ week: r.week, reels: num(r.reels) })),
    avgTokensPerEngagedBrand: engaged.length
      ? round1(totalTokens / engaged.length)
      : 0,
    avgReelsPerEngagedBrand: engaged.length
      ? round1(totalReels / engaged.length)
      : 0,
    tokensPerBrandHistogram: bucketize(tokensPerBrand, [5, 20, 50, 100]),
    reelsPerBrandHistogram: bucketize(reelsPerBrand, [2, 5, 10, 25]),
  };
};

// Section 5 — music insights over downloads (licenses) in range.
export const getFounderMusicService = async (range: DateRange) => {
  const [topTracks, topArtists, topGenres, topLanguages, trending] =
    await Promise.all([
      q<{ track_code: string; name: string | null; downloads: string; prev_downloads: string }>(
        `SELECT l."trackCode" AS track_code,
                MAX(t.name) AS name,
                COUNT(*) FILTER (WHERE ${inRange(`l."licensedAt"`)}) AS downloads,
                COUNT(*) FILTER (WHERE l."licensedAt" >= NOW() - INTERVAL '14 days'
                                   AND l."licensedAt" < NOW() - INTERVAL '7 days') AS prev_downloads
         FROM licenses l
         ${customerBrandJoin('l."brandId"')}
         LEFT JOIN tracks t ON t."trackCode" = l."trackCode"
         GROUP BY 1
         HAVING COUNT(*) FILTER (WHERE ${inRange(`l."licensedAt"`)}) > 0
         ORDER BY downloads DESC
         LIMIT 15`,
        range,
      ),
      q<{ artist: string; downloads: string }>(
        `SELECT a.name AS artist, COUNT(*) AS downloads
         FROM licenses l
         ${customerBrandJoin('l."brandId"')}
         JOIN tracks t ON t."trackCode" = l."trackCode"
         JOIN track_artist_mappings tam ON tam."trackId" = t.id AND tam."isPrimary" IS TRUE
         JOIN artists a ON a.id = tam."artistId"
         WHERE ${inRange(`l."licensedAt"`)}
         GROUP BY 1 ORDER BY 2 DESC LIMIT 10`,
        range,
      ),
      q<{ name: string; downloads: string }>(
        `SELECT f.name, COUNT(*) AS downloads
         FROM licenses l
         ${customerBrandJoin('l."brandId"')}
         JOIN tracks t ON t."trackCode" = l."trackCode"
         JOIN track_filter_mappings tfm ON tfm."trackId" = t.id
         JOIN filters f ON f.id = tfm."filterId" AND f.type = 'genre'
         WHERE ${inRange(`l."licensedAt"`)}
         GROUP BY 1 ORDER BY 2 DESC LIMIT 10`,
        range,
      ),
      q<{ name: string; downloads: string }>(
        `SELECT f.name, COUNT(*) AS downloads
         FROM licenses l
         ${customerBrandJoin('l."brandId"')}
         JOIN tracks t ON t."trackCode" = l."trackCode"
         JOIN track_filter_mappings tfm ON tfm."trackId" = t.id
         JOIN filters f ON f.id = tfm."filterId" AND f.type = 'language'
         WHERE ${inRange(`l."licensedAt"`)}
         GROUP BY 1 ORDER BY 2 DESC LIMIT 10`,
        range,
      ),
      // Week-over-week growth, minimum 2 downloads this week.
      q<{ track_code: string; name: string | null; this_week: string; last_week: string }>(
        `SELECT l."trackCode" AS track_code,
                MAX(t.name) AS name,
                COUNT(*) FILTER (WHERE l."licensedAt" >= NOW() - INTERVAL '7 days') AS this_week,
                COUNT(*) FILTER (WHERE l."licensedAt" >= NOW() - INTERVAL '14 days'
                                   AND l."licensedAt" < NOW() - INTERVAL '7 days') AS last_week
         FROM licenses l
         ${customerBrandJoin('l."brandId"')}
         LEFT JOIN tracks t ON t."trackCode" = l."trackCode"
         WHERE l."licensedAt" >= NOW() - INTERVAL '14 days'
         GROUP BY 1
         HAVING COUNT(*) FILTER (WHERE l."licensedAt" >= NOW() - INTERVAL '7 days') >= 2
         ORDER BY (COUNT(*) FILTER (WHERE l."licensedAt" >= NOW() - INTERVAL '7 days')
                   - COUNT(*) FILTER (WHERE l."licensedAt" >= NOW() - INTERVAL '14 days'
                                        AND l."licensedAt" < NOW() - INTERVAL '7 days')) DESC
         LIMIT 10`,
      ),
    ]);

  return {
    topDownloadedSongs: topTracks.map((r) => ({
      trackCode: r.track_code,
      name: r.name ?? r.track_code,
      downloads: num(r.downloads),
      prevWeekDownloads: num(r.prev_downloads),
    })),
    topArtists: topArtists.map((r) => ({ name: r.artist, downloads: num(r.downloads) })),
    topGenres: topGenres.map((r) => ({ name: r.name, downloads: num(r.downloads) })),
    topLanguages: topLanguages.map((r) => ({ name: r.name, downloads: num(r.downloads) })),
    trendingThisWeek: trending.map((r) => ({
      trackCode: r.track_code,
      name: r.name ?? r.track_code,
      thisWeek: num(r.this_week),
      lastWeek: num(r.last_week),
    })),
  };
};

// ─── Brands breakdown (drill-down) ───────────────────────────────────────────
// The exact brands behind the Overview tiles: filter=all → Total Brands,
// filter=new → Newly Onboarded Brands in the date range. One row per brand
// with onboarding date, health, and current kitty, so the tile number is
// fully accounted for.
export const getFounderBrandsBreakdownService = async (
  params: DateRange & { filter: string },
) => {
  const newOnly = params.filter === "new";
  const rows = await q<{
    brand_id: string;
    brand_name: string;
    onboarded_at: string;
    score: string;
    tier: string;
    packs: string | null;
    issued: string | null;
    balance: string | null;
    has_unlimited: boolean | null;
    last_active: string | null;
  }>(
    `WITH ${HEALTH_NOW},
     packs AS (
       SELECT ta."brandId" AS brand_id,
              COUNT(*) AS packs,
              SUM(CASE WHEN ta."isUnlimited" IS TRUE THEN 0
                       ELSE ta."totalAssignedToken" END) AS issued,
              SUM(CASE WHEN ta."isUnlimited" IS TRUE THEN 0
                       ELSE ta."tokenBalance" END) AS balance,
              BOOL_OR(ta."isUnlimited" IS TRUE) AS has_unlimited
       FROM token_assigned ta
       WHERE (ta."expiryDate" IS NULL OR ta."expiryDate" >= NOW())
       GROUP BY 1
     )
     SELECT b.id AS brand_id, b.name AS brand_name, b."createdAt" AS onboarded_at,
            hb.score, hb.tier,
            p.packs, p.issued, p.balance, p.has_unlimited,
            GREATEST(
              (SELECT MAX(u."lastLoginAt") FROM users u WHERE u."brandId" = b.id),
              (SELECT MAX(s."createdAt") FROM user_sessions s
               JOIN users u ON u.id = s."userId" WHERE u."brandId" = b.id)
            ) AS last_active
     FROM brands b
     JOIN health_banded hb ON hb.brand_id = b.id
     LEFT JOIN packs p ON p.brand_id = b.id
     WHERE ${customerPred("b")}
       ${newOnly ? `AND ${inRange(`b."createdAt"`)}` : ""}
     ORDER BY b."createdAt" DESC, b.name ASC`,
    params,
  );
  return {
    filter: newOnly ? "new" : "all",
    brands: rows.map((r) => ({
      brandId: num(r.brand_id),
      brandName: r.brand_name,
      onboardedAt: r.onboarded_at,
      healthScore: num(r.score),
      healthTier: r.tier,
      activePacks: num(r.packs),
      tokensIssued: num(r.issued),
      tokensLeft: num(r.balance),
      hasUnlimitedPack: r.has_unlimited === true,
      lastActiveAt: r.last_active,
    })),
  };
};

// ─── Token economics breakdown (drill-down) ──────────────────────────────────
// Per-brand rows behind each Token Economics tile, using the exact same
// filters as the tile itself so the rows sum to the headline number.
//   issued → in-force finite packs per brand
//   spent  → token deductions in range per brand (finite packs only)
//   reels  → reels posted in range per brand
export const getFounderTokenBreakdownService = async (
  params: DateRange & { metric: string },
) => {
  if (params.metric === "issued") {
    const rows = await q<{
      brand_id: string; brand_name: string; packs: string; pack_types: string | null;
      issued: string; balance: string; expiry: string | null;
    }>(
      `SELECT ta."brandId" AS brand_id, b.name AS brand_name,
              COUNT(*) AS packs,
              STRING_AGG(DISTINCT ta."type", ', ') AS pack_types,
              SUM(ta."totalAssignedToken") AS issued,
              SUM(ta."tokenBalance") AS balance,
              MIN(ta."expiryDate") AS expiry
       FROM token_assigned ta
       JOIN brands b ON b.id = ta."brandId" AND ${customerPred("b")}
       WHERE ta."isUnlimited" IS NOT TRUE
         AND (ta."expiryDate" IS NULL OR ta."expiryDate" >= NOW())
       GROUP BY 1, 2
       ORDER BY issued DESC, brand_name ASC`,
    );
    return {
      metric: "issued",
      rows: rows.map((r) => ({
        brandId: num(r.brand_id),
        brandName: r.brand_name,
        packs: num(r.packs),
        packTypes: r.pack_types,
        tokensIssued: num(r.issued),
        tokensLeft: num(r.balance),
        expiryDate: r.expiry,
      })),
    };
  }
  if (params.metric === "spent") {
    const rows = await q<{
      brand_id: string; brand_name: string; spent: string; deductions: string;
      last_spent_at: string | null;
    }>(
      `SELECT ta."brandId" AS brand_id, cb.name AS brand_name,
              COALESCE(SUM(td."deductedTokenCount"), 0) AS spent,
              COUNT(*) AS deductions,
              MAX(td."deductedAt") AS last_spent_at
       FROM token_deduction td
       JOIN token_assigned ta ON ta.id = td."tokenAssignedId" AND ta."isUnlimited" IS NOT TRUE
       ${customerBrandJoin('ta."brandId"')}
       WHERE ${inRange(`td."deductedAt"`)}
       GROUP BY 1, 2
       ORDER BY spent DESC, brand_name ASC`,
      params,
    );
    return {
      metric: "spent",
      rows: rows.map((r) => ({
        brandId: num(r.brand_id),
        brandName: r.brand_name,
        tokensSpent: num(r.spent),
        deductions: num(r.deductions),
        lastSpentAt: r.last_spent_at,
      })),
    };
  }
  // reels
  const rows = await q<{
    brand_id: string; brand_name: string; reels: string; last_reel_at: string | null;
  }>(
    `SELECT vl."brandId" AS brand_id, cb.name AS brand_name,
            COUNT(*) AS reels,
            MAX(vl."createdAt") AS last_reel_at
     FROM video_links vl
     ${customerBrandJoin('vl."brandId"')}
     WHERE ${inRange(`vl."createdAt"`)}
     GROUP BY 1, 2
     ORDER BY reels DESC, brand_name ASC`,
    params,
  );
  return {
    metric: "reels",
    rows: rows.map((r) => ({
      brandId: num(r.brand_id),
      brandName: r.brand_name,
      reels: num(r.reels),
      lastReelAt: r.last_reel_at,
    })),
  };
};

// ─── Renewal breakdown (drill-down) ──────────────────────────────────────────
// Every pack expiry of the last 12 months with whether a follow-up pack
// arrived within the renewal window — the raw rows behind the renewal rate,
// logo churn, and renewals-by-quarter numbers.
export const getFounderRenewalBreakdownService = async () => {
  const rows = await q<{
    brand_id: string;
    brand_name: string;
    expiry_date: string;
    quarter: string;
    issued: string;
    renewed_at: string | null;
  }>(
    `SELECT ta."brandId" AS brand_id, b.name AS brand_name,
            ta."expiryDate" AS expiry_date,
            to_char(date_trunc('quarter', ta."expiryDate"), 'YYYY-"Q"Q') AS quarter,
            ta."totalAssignedToken" AS issued,
            (SELECT MIN(nxt."createdAt") FROM token_assigned nxt
             WHERE nxt."brandId" = ta."brandId"
               AND nxt."createdAt" > ta."expiryDate" - INTERVAL '15 days'
               AND nxt."createdAt" < ta."expiryDate" + INTERVAL '45 days'
               AND nxt.id <> ta.id) AS renewed_at
     FROM token_assigned ta
     JOIN brands b ON b.id = ta."brandId" AND ${customerPred("b")}
     WHERE ta."expiryDate" IS NOT NULL
       AND ta."expiryDate" < NOW()
       AND ta."expiryDate" >= NOW() - INTERVAL '12 months'
     ORDER BY ta."expiryDate" DESC, b.name ASC`,
  );
  return {
    expiries: rows.map((r) => ({
      brandId: num(r.brand_id),
      brandName: r.brand_name,
      expiryDate: r.expiry_date,
      quarter: r.quarter,
      tokensIssued: num(r.issued),
      renewed: r.renewed_at != null,
      renewedAt: r.renewed_at,
    })),
  };
};

// ─── Customer health scores (drill-down) ─────────────────────────────────────
// One row per brand with the exact score, tier, and the raw signal values the
// score is built from, so the FE can explain WHY a brand landed in its tier
// ("No login in the last 7 days: -15"). Weights live in healthCte; the FE
// mirrors them for display only.
export const getFounderHealthScoresService = async () => {
  const rows = await q<{
    brand_id: string;
    brand_name: string;
    reel_30d: boolean;
    reels_90d: string;
    download_30d: boolean;
    login_7d: boolean;
    active_weeks_4w: string;
    search_30d: boolean;
    active_seats_30d: string;
    score: string;
    tier: string;
    renewal_soon: boolean;
  }>(
    `WITH ${HEALTH_NOW}
     SELECT hs.brand_id, b.name AS brand_name,
            hs.reel_30d, hs.reels_90d, hs.download_30d, hs.login_7d,
            hs.active_weeks_4w, hs.search_30d, hs.active_seats_30d,
            hb.score, hb.tier, hb.renewal_soon
     FROM health_signals hs
     JOIN health_banded hb ON hb.brand_id = hs.brand_id
     JOIN brands b ON b.id = hs.brand_id
     ORDER BY hb.score ASC, b.name ASC`,
  );
  return {
    brands: rows.map((r) => ({
      brandId: num(r.brand_id),
      brandName: r.brand_name,
      healthScore: num(r.score),
      healthTier: r.tier,
      renewalSoon: r.renewal_soon === true,
      signals: {
        reel30d: r.reel_30d === true,
        reels90d: num(r.reels_90d),
        download30d: r.download_30d === true,
        login7d: r.login_7d === true,
        activeWeeks4w: num(r.active_weeks_4w),
        search30d: r.search_30d === true,
        activeSeats30d: num(r.active_seats_30d),
      },
    })),
  };
};

// ─── Top users per brand (drill-down) ────────────────────────────────────────
// Every team member of every customer brand with lifetime token spend (via
// deduction → license → user; internal deductions carry no user and are
// excluded), lifetime downloads, and last-active. The FE surfaces the top
// spender per brand and expands to the full member breakdown on click.
export const getFounderTopUsersService = async () => {
  const rows = await q<{
    brand_id: string;
    brand_name: string;
    user_id: string;
    user_name: string | null;
    email: string;
    user_status: string;
    tokens: string | null;
    downloads: string;
    last_active: string | null;
  }>(
    `WITH member_tokens AS (
       SELECT l."userId" AS user_id, SUM(td."deductedTokenCount") AS tokens
       FROM token_deduction td
       JOIN licenses l ON l.id = td."licenseId"
       GROUP BY 1
     )
     SELECT u."brandId" AS brand_id, b.name AS brand_name,
            u.id AS user_id,
            NULLIF(TRIM(CONCAT(u."firstName", ' ', u."lastName")), '') AS user_name,
            u.email,
            u.status AS user_status,
            mt.tokens,
            (SELECT COUNT(*) FROM licenses l2 WHERE l2."userId" = u.id) AS downloads,
            GREATEST(
              u."lastLoginAt",
              (SELECT MAX(s."createdAt") FROM user_sessions s WHERE s."userId" = u.id)
            ) AS last_active
     FROM users u
     JOIN brands b ON b.id = u."brandId" AND ${customerPred("b")}
     LEFT JOIN member_tokens mt ON mt.user_id = u.id
     ORDER BY b.name ASC, COALESCE(mt.tokens, 0) DESC, u.email ASC`,
  );

  const byBrand = new Map<
    number,
    { brandId: number; brandName: string; members: Array<{
      userId: number; name: string; email: string; status: string;
      tokensSpent: number; downloads: number; lastActiveAt: string | null;
    }> }
  >();
  for (const r of rows) {
    const brandId = num(r.brand_id);
    let entry = byBrand.get(brandId);
    if (!entry) {
      entry = { brandId, brandName: r.brand_name, members: [] };
      byBrand.set(brandId, entry);
    }
    entry.members.push({
      userId: num(r.user_id),
      name: r.user_name ?? r.email,
      email: r.email,
      status: r.user_status,
      tokensSpent: num(r.tokens),
      downloads: num(r.downloads),
      lastActiveAt: r.last_active,
    });
  }

  // Members arrive sorted tokens-desc, so members[0] is the brand's top user.
  const brands = [...byBrand.values()].sort(
    (a, b) =>
      (b.members[0]?.tokensSpent ?? 0) - (a.members[0]?.tokensSpent ?? 0) ||
      a.brandName.localeCompare(b.brandName),
  );
  return { brands };
};

// ─── Track downloaders (drill-down) ──────────────────────────────────────────
// Who downloaded a given track within the range — powers the click-through on
// Music Insights download counts.
export const getFounderTrackDownloadersService = async (
  params: DateRange & { trackCode: string },
) => {
  const rows = await q<{
    user_id: string;
    user_name: string | null;
    email: string;
    brand_name: string;
    downloads: string;
    last_downloaded_at: string;
  }>(
    `SELECT u.id AS user_id,
            NULLIF(TRIM(CONCAT(u."firstName", ' ', u."lastName")), '') AS user_name,
            u.email,
            cb.name AS brand_name,
            COUNT(*) AS downloads,
            MAX(l."licensedAt") AS last_downloaded_at
     FROM licenses l
     ${customerBrandJoin('l."brandId"')}
     JOIN users u ON u.id = l."userId"
     WHERE l."trackCode" = :trackCode AND ${inRange(`l."licensedAt"`)}
     GROUP BY 1, 2, 3, 4
     ORDER BY downloads DESC, last_downloaded_at DESC`,
    params,
  );
  return {
    users: rows.map((r) => ({
      userId: num(r.user_id),
      name: r.user_name ?? r.email,
      email: r.email,
      brandName: r.brand_name,
      downloads: num(r.downloads),
      lastDownloadedAt: r.last_downloaded_at,
    })),
  };
};

// Section 6 — retention & renewal. "Renewal" is inferred: a pack expired and
// the brand received a new pack within 45 days of that expiry (there is no
// renewal entity by design).
export const getFounderRetentionService = async () => {
  const [cohorts, renewals, expansion] = await Promise.all([
    q<{ cohort_month: string; week_index: string; active_brands: string; cohort_size: string }>(
      `WITH cohort AS (
         SELECT b.id, date_trunc('month', b."createdAt") AS cohort_month
         FROM ${ACTIVE_BRANDS} AND b."createdAt" >= NOW() - INTERVAL '6 months'
       ),
       sizes AS (
         SELECT cohort_month, COUNT(*) AS cohort_size FROM cohort GROUP BY 1
       ),
       activity AS (
         SELECT c.cohort_month,
                FLOOR(EXTRACT(EPOCH FROM (s."createdAt" - c.cohort_month)) / (86400 * 7))::int AS week_index,
                c.id
         FROM cohort c
         JOIN users u ON u."brandId" = c.id
         JOIN user_sessions s ON s."userId" = u.id
         WHERE s."createdAt" >= c.cohort_month
       )
       SELECT to_char(a.cohort_month, 'YYYY-MM') AS cohort_month,
              a.week_index,
              COUNT(DISTINCT a.id) AS active_brands,
              MAX(sz.cohort_size) AS cohort_size
       FROM activity a
       JOIN sizes sz ON sz.cohort_month = a.cohort_month
       WHERE a.week_index BETWEEN 0 AND 7
       GROUP BY 1, 2
       ORDER BY 1, 2`,
    ),
    q<{ quarter: string; expired: string; renewed: string }>(
      `WITH expiries AS (
         SELECT ta."brandId",
                ta."expiryDate",
                to_char(date_trunc('quarter', ta."expiryDate"), 'YYYY-"Q"Q') AS quarter,
                EXISTS (
                  SELECT 1 FROM token_assigned nxt
                  WHERE nxt."brandId" = ta."brandId"
                    AND nxt."createdAt" > ta."expiryDate" - INTERVAL '15 days'
                    AND nxt."createdAt" < ta."expiryDate" + INTERVAL '45 days'
                    AND nxt.id <> ta.id
                ) AS renewed
         FROM token_assigned ta
         JOIN brands b ON b.id = ta."brandId" AND ${customerPred("b")}
         WHERE ta."expiryDate" IS NOT NULL
           AND ta."expiryDate" < NOW()
           AND ta."expiryDate" >= NOW() - INTERVAL '12 months'
       )
       SELECT quarter, COUNT(*) AS expired,
              COUNT(*) FILTER (WHERE renewed) AS renewed
       FROM expiries GROUP BY 1 ORDER BY 1`,
    ),
    // High-utilization healthy brands = expansion candidates.
    q<{ brand_id: string; brand_name: string; utilization: string; balance: string; expiry: string | null }>(
      `WITH ${HEALTH_NOW},
       packs AS (
         SELECT ta."brandId" AS brand_id,
                SUM(ta."totalAssignedToken") AS issued,
                SUM(ta."tokenBalance") AS balance,
                MIN(ta."expiryDate") AS expiry
         FROM token_assigned ta
         WHERE ta."isUnlimited" IS NOT TRUE
           AND (ta."expiryDate" IS NULL OR ta."expiryDate" >= NOW())
         GROUP BY 1
         HAVING SUM(ta."totalAssignedToken") > 0
       )
       SELECT p.brand_id, b.name AS brand_name,
              ROUND(100.0 * (p.issued - p.balance) / p.issued, 1) AS utilization,
              p.balance, p.expiry
       FROM packs p
       JOIN brands b ON b.id = p.brand_id AND b.status = 'ACTIVE'
       JOIN health_banded hb ON hb.brand_id = p.brand_id
       WHERE (p.issued - p.balance) >= 0.7 * p.issued
         AND hb.tier IN ('HEALTHY', 'MODERATE')
       ORDER BY utilization DESC
       LIMIT 20`,
    ),
  ]);

  const totalExpired = renewals.reduce((a, r) => a + num(r.expired), 0);
  const totalRenewed = renewals.reduce((a, r) => a + num(r.renewed), 0);

  return {
    retentionCohorts: cohorts.map((r) => ({
      cohortMonth: r.cohort_month,
      weekIndex: num(r.week_index),
      activeBrands: num(r.active_brands),
      cohortSize: num(r.cohort_size),
      retentionPct: pct(num(r.active_brands), num(r.cohort_size)),
    })),
    renewalRateByQuarter: renewals.map((r) => ({
      quarter: r.quarter,
      packsExpired: num(r.expired),
      renewed: num(r.renewed),
      renewalRatePct: pct(num(r.renewed), num(r.expired)),
    })),
    overallRenewalRatePct: pct(totalRenewed, totalExpired),
    logoChurnRatePct: pct(totalExpired - totalRenewed, totalExpired),
    expansionOpportunities: expansion.map((r) => ({
      brandId: num(r.brand_id),
      brandName: r.brand_name,
      utilizationPct: num(r.utilization),
      tokensLeft: num(r.balance),
      expiryDate: r.expiry,
    })),
  };
};
