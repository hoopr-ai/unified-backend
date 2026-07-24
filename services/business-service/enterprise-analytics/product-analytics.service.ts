import {
  q,
  num,
  pct,
  round1,
  inRange,
  istDay,
  ACTIVE_BRANDS,
  customerPred,
  customerBrandJoin,
  type DateRange,
} from "./analytics-shared";

// ─── Product dashboard ───────────────────────────────────────────────────────
// Friction between search and a published reel. Search data comes from
// brand_search_history (max 90 days back); previews from user_stream_history,
// which is aggregated per (user, track) — event-level conversion isn't
// derivable, so the funnel is measured at brand level: of the brands that
// searched in range, how many previewed / downloaded / submitted a reel.

// Section 1 — search & discovery funnel (brand-level) + search friction.
export const getProductFunnelService = async (range: DateRange) => {
  const [funnel, searchSeries] = await Promise.all([
    q<{
      searched: string; previewed: string; downloaded: string; reeled: string;
      total_searches: string; searching_users: string;
    }>(
      `WITH brand_stage AS (
         SELECT b.id,
           EXISTS (SELECT 1 FROM brand_search_history sh
                   WHERE sh."brandId" = b.id AND ${inRange(`sh."createdAt"`)}) AS searched,
           EXISTS (SELECT 1 FROM users u JOIN user_stream_history ush ON ush."userId" = u.id
                   WHERE u."brandId" = b.id AND ush."streamType" IN ('PREVIEW', 'PLAY')
                     AND ${inRange(`ush."lastStreamedAt"`)}) AS previewed,
           EXISTS (SELECT 1 FROM licenses l
                   WHERE l."brandId" = b.id AND ${inRange(`l."licensedAt"`)}) AS downloaded,
           EXISTS (SELECT 1 FROM video_links vl
                   WHERE vl."brandId" = b.id AND ${inRange(`vl."createdAt"`)}) AS reeled
         FROM ${ACTIVE_BRANDS}
       )
       SELECT COUNT(*) FILTER (WHERE searched) AS searched,
              COUNT(*) FILTER (WHERE searched AND previewed) AS previewed,
              COUNT(*) FILTER (WHERE searched AND downloaded) AS downloaded,
              COUNT(*) FILTER (WHERE searched AND downloaded AND reeled) AS reeled,
              (SELECT COUNT(*) FROM brand_search_history sh
               ${customerBrandJoin('sh."brandId"')}
               WHERE ${inRange(`sh."createdAt"`)}) AS total_searches,
              (SELECT COUNT(DISTINCT sh."userId") FROM brand_search_history sh
               ${customerBrandJoin('sh."brandId"')}
               WHERE ${inRange(`sh."createdAt"`)} AND sh."userId" IS NOT NULL) AS searching_users
       FROM brand_stage`,
      range,
    ),
    q<{ day: string; searches: string; brands: string }>(
      `SELECT ${istDay(`sh."createdAt"`)} AS day,
              COUNT(*) AS searches,
              COUNT(DISTINCT sh."brandId") AS brands
       FROM brand_search_history sh
       ${customerBrandJoin('sh."brandId"')}
       WHERE ${inRange(`sh."createdAt"`)}
       GROUP BY 1 ORDER BY 1`,
      range,
    ),
  ]);

  const f = funnel[0];
  const searched = num(f?.searched);
  const previewed = num(f?.previewed);
  const downloaded = num(f?.downloaded);
  const reeled = num(f?.reeled);

  return {
    totalSearches: num(f?.total_searches),
    searchingUsers: num(f?.searching_users),
    brandFunnel: [
      { stage: "Searched", count: searched, conversionFromPrev: 100 },
      { stage: "Previewed", count: previewed, conversionFromPrev: pct(previewed, searched) },
      { stage: "Downloaded (token spent)", count: downloaded, conversionFromPrev: pct(downloaded, previewed) },
      { stage: "Reel Submitted", count: reeled, conversionFromPrev: pct(reeled, downloaded) },
    ],
    // Brands that searched but spent no token in range — the abandonment proxy.
    searchAbandonmentPct: pct(searched - downloaded, searched),
    searchSeries: searchSeries.map((r) => ({
      day: r.day,
      searches: num(r.searches),
      brands: num(r.brands),
    })),
  };
};

// Section 1b — what people search for and with which filters.
export const getProductSearchInsightsService = async (range: DateRange) => {
  const [topQueries, filterTypes, filterValues, topSearchingBrands] =
    await Promise.all([
      q<{ query: string; searches: string; brands: string }>(
        `SELECT LOWER(TRIM(sh.query)) AS query,
                COUNT(*) AS searches,
                COUNT(DISTINCT sh."brandId") AS brands
         FROM brand_search_history sh
         ${customerBrandJoin('sh."brandId"')}
         WHERE ${inRange(`sh."createdAt"`)} AND COALESCE(TRIM(sh.query), '') <> ''
         GROUP BY 1 ORDER BY 2 DESC LIMIT 20`,
        range,
      ),
      q<{ filter_type: string; uses: string }>(
        `SELECT f->>'type' AS filter_type, COUNT(*) AS uses
         FROM brand_search_history sh
         ${customerBrandJoin('sh."brandId"')},
              jsonb_array_elements(sh.filters) AS f
         WHERE ${inRange(`sh."createdAt"`)} AND sh.filters IS NOT NULL
         GROUP BY 1 ORDER BY 2 DESC LIMIT 12`,
        range,
      ),
      q<{ filter_type: string; filter_value: string; uses: string }>(
        `SELECT f->>'type' AS filter_type,
                CASE
                  WHEN jsonb_typeof(f->'value') = 'array'
                  THEN (SELECT string_agg(x #>> '{}', ', ') FROM jsonb_array_elements(f->'value') x)
                  ELSE f->>'value'
                END AS filter_value,
                COUNT(*) AS uses
         FROM brand_search_history sh
         ${customerBrandJoin('sh."brandId"')},
              jsonb_array_elements(sh.filters) AS f
         WHERE ${inRange(`sh."createdAt"`)} AND sh.filters IS NOT NULL
         GROUP BY 1, 2 ORDER BY 3 DESC LIMIT 20`,
        range,
      ),
      q<{ brand_id: string; brand_name: string; searches: string; downloads: string }>(
        `SELECT sh."brandId" AS brand_id,
                MAX(sh."brandName") AS brand_name,
                COUNT(*) AS searches,
                (SELECT COUNT(*) FROM licenses l
                 WHERE l."brandId" = sh."brandId" AND ${inRange(`l."licensedAt"`)}) AS downloads
         FROM brand_search_history sh
         ${customerBrandJoin('sh."brandId"')}
         WHERE ${inRange(`sh."createdAt"`)}
         GROUP BY sh."brandId" ORDER BY 3 DESC LIMIT 15`,
        range,
      ),
    ]);

  return {
    topQueries: topQueries.map((r) => ({
      query: r.query,
      searches: num(r.searches),
      brands: num(r.brands),
    })),
    filterTypeUsage: filterTypes.map((r) => ({
      type: r.filter_type ?? "unknown",
      uses: num(r.uses),
    })),
    topFilterValues: filterValues.map((r) => ({
      type: r.filter_type ?? "unknown",
      value: r.filter_value ?? "",
      uses: num(r.uses),
    })),
    topSearchingBrands: topSearchingBrands.map((r) => ({
      brandId: num(r.brand_id),
      brandName: r.brand_name,
      searches: num(r.searches),
      downloads: num(r.downloads),
    })),
  };
};

// Section 2 — token spend patterns.
export const getProductTokenSpendService = async (range: DateRange) => {
  const [burstiness, noReel, lag, reasonSplit] = await Promise.all([
    // Tokens spent per brand-day → stockpiling vs. steady use.
    q<{ tokens_per_day: string; brand_days: string }>(
      `WITH brand_days AS (
         SELECT ta."brandId", ${istDay(`td."deductedAt"`)} AS day,
                SUM(td."deductedTokenCount") AS tokens
         FROM token_deduction td
         JOIN token_assigned ta ON ta.id = td."tokenAssignedId"
         ${customerBrandJoin('ta."brandId"')}
         WHERE ${inRange(`td."deductedAt"`)}
         GROUP BY 1, 2
       )
       SELECT LEAST(tokens, 10)::int AS tokens_per_day, COUNT(*) AS brand_days
       FROM brand_days GROUP BY 1 ORDER BY 1`,
      range,
    ),
    // % of downloads ≥30 days old with no reel within 30 days — core waste metric.
    q<{ eligible: string; no_reel: string }>(
      `SELECT COUNT(*) AS eligible,
              COUNT(*) FILTER (WHERE NOT EXISTS (
                SELECT 1 FROM video_links vl
                WHERE vl."licenseId" = l.id
                  AND vl."createdAt" <= l."licensedAt" + INTERVAL '30 days'
              )) AS no_reel
       FROM licenses l
       ${customerBrandJoin('l."brandId"')}
       WHERE ${inRange(`l."licensedAt"`)}
         AND l."licensedAt" <= NOW() - INTERVAL '30 days'`,
      range,
    ),
    q<{ median_days: string | null; p90_days: string | null }>(
      `SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY
                EXTRACT(EPOCH FROM (vl."createdAt" - l."licensedAt")) / 86400) AS median_days,
              percentile_cont(0.9) WITHIN GROUP (ORDER BY
                EXTRACT(EPOCH FROM (vl."createdAt" - l."licensedAt")) / 86400) AS p90_days
       FROM video_links vl
       ${customerBrandJoin('vl."brandId"')}
       JOIN licenses l ON l.id = vl."licenseId"
       WHERE ${inRange(`vl."createdAt"`)} AND vl."createdAt" >= l."licensedAt"`,
      range,
    ),
    q<{ reason: string; deductions: string; tokens: string }>(
      `SELECT td.reason, COUNT(*) AS deductions,
              COALESCE(SUM(td."deductedTokenCount"), 0) AS tokens
       FROM token_deduction td
       JOIN token_assigned ta ON ta.id = td."tokenAssignedId"
       ${customerBrandJoin('ta."brandId"')}
       WHERE ${inRange(`td."deductedAt"`)}
       GROUP BY 1`,
      range,
    ),
  ]);

  return {
    tokensPerBrandDayDistribution: burstiness.map((r) => ({
      tokensPerDay: num(r.tokens_per_day),
      brandDays: num(r.brand_days),
    })),
    tokenSpendNoReel: {
      eligibleDownloads: num(noReel[0]?.eligible),
      withoutReelIn30d: num(noReel[0]?.no_reel),
      noReelRatePct: pct(num(noReel[0]?.no_reel), num(noReel[0]?.eligible)),
    },
    spendToReelLag: {
      medianDays: lag[0]?.median_days === null ? null : round1(num(lag[0]?.median_days)),
      p90Days: lag[0]?.p90_days === null ? null : round1(num(lag[0]?.p90_days)),
    },
    deductionReasonSplit: reasonSplit.map((r) => ({
      reason: r.reason,
      deductions: num(r.deductions),
      tokens: num(r.tokens),
    })),
  };
};

// Section 3 — feature adoption & session behavior.
export const getProductBehaviorService = async (range: DateRange) => {
  const [adoption, sessions, devices] = await Promise.all([
    q<{
      active: string; searched: string; used_filters: string;
      previewed: string; downloaded: string; reeled: string;
    }>(
      `WITH flags AS (
         SELECT b.id,
           EXISTS (SELECT 1 FROM users u JOIN user_sessions s ON s."userId" = u.id
                   WHERE u."brandId" = b.id AND ${inRange(`s."createdAt"`)}) AS active,
           EXISTS (SELECT 1 FROM brand_search_history sh
                   WHERE sh."brandId" = b.id AND ${inRange(`sh."createdAt"`)}) AS searched,
           EXISTS (SELECT 1 FROM brand_search_history sh
                   WHERE sh."brandId" = b.id AND ${inRange(`sh."createdAt"`)}
                     AND sh.filters IS NOT NULL AND jsonb_array_length(sh.filters) > 0) AS used_filters,
           EXISTS (SELECT 1 FROM users u JOIN user_stream_history ush ON ush."userId" = u.id
                   WHERE u."brandId" = b.id AND ush."streamType" IN ('PREVIEW', 'PLAY')
                     AND ${inRange(`ush."lastStreamedAt"`)}) AS previewed,
           EXISTS (SELECT 1 FROM licenses l WHERE l."brandId" = b.id
                   AND ${inRange(`l."licensedAt"`)}) AS downloaded,
           EXISTS (SELECT 1 FROM video_links vl WHERE vl."brandId" = b.id
                   AND ${inRange(`vl."createdAt"`)}) AS reeled
         FROM ${ACTIVE_BRANDS}
       )
       SELECT COUNT(*) FILTER (WHERE active) AS active,
              COUNT(*) FILTER (WHERE active AND searched) AS searched,
              COUNT(*) FILTER (WHERE active AND used_filters) AS used_filters,
              COUNT(*) FILTER (WHERE active AND previewed) AS previewed,
              COUNT(*) FILTER (WHERE active AND downloaded) AS downloaded,
              COUNT(*) FILTER (WHERE active AND reeled) AS reeled
       FROM flags`,
      range,
    ),
    q<{ sessions: string; brands: string; avg_minutes: string | null; median_minutes: string | null }>(
      `SELECT COUNT(*) AS sessions,
              COUNT(DISTINCT u."brandId") AS brands,
              -- Sessions can stay open for days via token refreshes; anything
              -- over 12h is a keepalive artifact, not a real working session.
              AVG(EXTRACT(EPOCH FROM (s."lastActivityAt" - s."createdAt")) / 60)
                FILTER (WHERE s."lastActivityAt" > s."createdAt"
                          AND s."lastActivityAt" - s."createdAt" <= INTERVAL '12 hours') AS avg_minutes,
              percentile_cont(0.5) WITHIN GROUP (
                ORDER BY EXTRACT(EPOCH FROM (s."lastActivityAt" - s."createdAt")) / 60)
                FILTER (WHERE s."lastActivityAt" > s."createdAt"
                          AND s."lastActivityAt" - s."createdAt" <= INTERVAL '12 hours') AS median_minutes
       FROM user_sessions s
       JOIN users u ON u.id = s."userId" AND u."brandId" IS NOT NULL
       ${customerBrandJoin('u."brandId"')}
       WHERE ${inRange(`s."createdAt"`)}`,
      range,
    ),
    q<{ device_type: string | null; sessions: string }>(
      `SELECT s."deviceType" AS device_type, COUNT(*) AS sessions
       FROM user_sessions s
       JOIN users u ON u.id = s."userId" AND u."brandId" IS NOT NULL
       ${customerBrandJoin('u."brandId"')}
       WHERE ${inRange(`s."createdAt"`)}
       GROUP BY 1 ORDER BY 2 DESC`,
      range,
    ),
  ]);

  const a = adoption[0];
  const activeBrands = num(a?.active);
  const featurePct = (v: unknown) => pct(num(v), activeBrands);

  return {
    activeBrands,
    featureAdoption: [
      { feature: "Search", brands: num(a?.searched), pctOfActive: featurePct(a?.searched) },
      { feature: "Filters", brands: num(a?.used_filters), pctOfActive: featurePct(a?.used_filters) },
      { feature: "Preview", brands: num(a?.previewed), pctOfActive: featurePct(a?.previewed) },
      { feature: "Download", brands: num(a?.downloaded), pctOfActive: featurePct(a?.downloaded) },
      { feature: "Reel Submit", brands: num(a?.reeled), pctOfActive: featurePct(a?.reeled) },
    ],
    sessions: {
      total: num(sessions[0]?.sessions),
      brands: num(sessions[0]?.brands),
      perBrand: num(sessions[0]?.brands) > 0
        ? round1(num(sessions[0]?.sessions) / num(sessions[0]?.brands))
        : 0,
      avgDurationMinutes:
        sessions[0]?.avg_minutes === null ? null : round1(num(sessions[0]?.avg_minutes)),
      medianDurationMinutes:
        sessions[0]?.median_minutes === null ? null : round1(num(sessions[0]?.median_minutes)),
    },
    deviceSplit: devices.map((r) => ({
      deviceType: r.device_type ?? "unknown",
      sessions: num(r.sessions),
    })),
  };
};
