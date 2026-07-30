import {
  q,
  num,
  inRange,
  ACTIVE_BRANDS,
  HEALTH_NOW,
  brandExclusions,
  customerBrandJoin,
  type DateRange,
} from "./analytics-shared";

// ─── Drill-down endpoints ────────────────────────────────────────────────────
// Full-detail views behind the dashboard numbers: one brand's complete
// picture, per-entity music downloads, per-brand engagement, funnel-stage
// brand lists, search-query detail, and feature-adoption brand lists.
// Every list the FE shows must be fully accounted for — no sampled data.

const USER_NAME_SQL = `NULLIF(TRIM(CONCAT(u."firstName", ' ', u."lastName")), '')`;

// ─── Brand detail ────────────────────────────────────────────────────────────
// Everything about one brand: header, health signals, every member with
// last-login, every pack past & present, and an activity summary. Only the
// internal-brand exclusions apply so deactivated brands stay reachable from
// the Active Accounts page.
export const getFounderBrandDetailService = async (params: { brandId: number }) => {
  const [brandRows, healthRows, memberRows, packRows, activityRows] =
    await Promise.all([
      q<{
        brand_id: string; brand_name: string; brand_status: string;
        organization_name: string | null; onboarded_at: string;
      }>(
        `SELECT b.id AS brand_id, b.name AS brand_name, b.status AS brand_status,
                o.name AS organization_name, b."createdAt" AS onboarded_at
         FROM brands b
         LEFT JOIN organizations o ON o.id = b."organizationId"
         WHERE b.id = :brandId AND ${brandExclusions("b")}`,
        params,
      ),
      // Health only exists for brands in the customer population; a churned
      // or deactivated brand simply gets null health.
      q<{
        reel_30d: boolean; reels_90d: string; download_30d: boolean;
        login_7d: boolean; active_weeks_4w: string; search_30d: boolean;
        active_seats_30d: string; score: string; tier: string; renewal_soon: boolean;
      }>(
        `WITH ${HEALTH_NOW}
         SELECT hs.reel_30d, hs.reels_90d, hs.download_30d, hs.login_7d,
                hs.active_weeks_4w, hs.search_30d, hs.active_seats_30d,
                hb.score, hb.tier, hb.renewal_soon
         FROM health_signals hs
         JOIN health_banded hb ON hb.brand_id = hs.brand_id
         WHERE hs.brand_id = :brandId`,
        params,
      ),
      q<{
        user_id: string; user_name: string | null; email: string; user_status: string;
        last_login_at: string | null; last_session_at: string | null;
        tokens: string | null; downloads: string;
      }>(
        `WITH member_tokens AS (
           SELECT l."userId" AS user_id, SUM(td."deductedTokenCount") AS tokens
           FROM token_deduction td
           JOIN licenses l ON l.id = td."licenseId"
           WHERE l."brandId" = :brandId
           GROUP BY 1
         )
         SELECT u.id AS user_id,
                ${USER_NAME_SQL} AS user_name,
                u.email,
                u.status AS user_status,
                u."lastLoginAt" AS last_login_at,
                (SELECT MAX(s."createdAt") FROM user_sessions s
                 WHERE s."userId" = u.id) AS last_session_at,
                mt.tokens,
                (SELECT COUNT(*) FROM licenses l2
                 WHERE l2."userId" = u.id AND l2."brandId" = :brandId) AS downloads
         FROM users u
         LEFT JOIN member_tokens mt ON mt.user_id = u.id
         WHERE u."brandId" = :brandId
         ORDER BY COALESCE(mt.tokens, 0) DESC, u.email ASC`,
        params,
      ),
      q<{
        pack_id: string; pack_type: string; issued: string; balance: string;
        is_unlimited: boolean; assigned_at: string; expiry_date: string | null;
      }>(
        `SELECT ta.id AS pack_id, ta."type" AS pack_type,
                ta."totalAssignedToken" AS issued, ta."tokenBalance" AS balance,
                ta."isUnlimited" AS is_unlimited,
                ta."createdAt" AS assigned_at, ta."expiryDate" AS expiry_date
         FROM token_assigned ta
         WHERE ta."brandId" = :brandId
         ORDER BY ta."createdAt" DESC`,
        params,
      ),
      q<{
        downloads_total: string; downloads_30d: string;
        reels_total: string; reels_30d: string; last_reel_at: string | null;
        searches_30d: string; last_active: string | null;
      }>(
        `SELECT
           (SELECT COUNT(*) FROM licenses l WHERE l."brandId" = :brandId) AS downloads_total,
           (SELECT COUNT(*) FROM licenses l WHERE l."brandId" = :brandId
            AND l."licensedAt" >= NOW() - INTERVAL '30 days') AS downloads_30d,
           (SELECT COUNT(*) FROM video_links vl WHERE vl."brandId" = :brandId) AS reels_total,
           (SELECT COUNT(*) FROM video_links vl WHERE vl."brandId" = :brandId
            AND vl."createdAt" >= NOW() - INTERVAL '30 days') AS reels_30d,
           (SELECT MAX(vl."createdAt") FROM video_links vl
            WHERE vl."brandId" = :brandId) AS last_reel_at,
           (SELECT COUNT(*) FROM brand_search_history sh WHERE sh."brandId" = :brandId
            AND sh."createdAt" >= NOW() - INTERVAL '30 days') AS searches_30d,
           GREATEST(
             (SELECT MAX(u."lastLoginAt") FROM users u WHERE u."brandId" = :brandId),
             (SELECT MAX(s."createdAt") FROM user_sessions s
              JOIN users u ON u.id = s."userId" WHERE u."brandId" = :brandId)
           ) AS last_active`,
        params,
      ),
    ]);

  const brand = brandRows[0];
  if (!brand) return { brand: null };

  const h = healthRows[0];
  const a = activityRows[0];
  const now = Date.now();

  return {
    brand: {
      brandId: num(brand.brand_id),
      brandName: brand.brand_name,
      brandStatus: brand.brand_status,
      organizationName: brand.organization_name,
      onboardedAt: brand.onboarded_at,
    },
    health: h
      ? {
          healthScore: num(h.score),
          healthTier: h.tier,
          renewalSoon: h.renewal_soon === true,
          signals: {
            reel30d: h.reel_30d === true,
            reels90d: num(h.reels_90d),
            download30d: h.download_30d === true,
            login7d: h.login_7d === true,
            activeWeeks4w: num(h.active_weeks_4w),
            search30d: h.search_30d === true,
            activeSeats30d: num(h.active_seats_30d),
          },
        }
      : null,
    members: memberRows.map((m) => ({
      userId: num(m.user_id),
      name: m.user_name ?? m.email,
      email: m.email,
      status: m.user_status,
      lastLoginAt: m.last_login_at,
      lastActiveAt:
        m.last_session_at != null &&
        (m.last_login_at == null || m.last_session_at > m.last_login_at)
          ? m.last_session_at
          : m.last_login_at,
      tokensSpent: num(m.tokens),
      downloads: num(m.downloads),
    })),
    packs: packRows.map((p) => ({
      packId: num(p.pack_id),
      type: p.pack_type,
      tokensIssued: num(p.issued),
      tokensLeft: num(p.balance),
      isUnlimited: p.is_unlimited === true,
      assignedAt: p.assigned_at,
      expiryDate: p.expiry_date,
      status:
        p.expiry_date == null || new Date(p.expiry_date).getTime() >= now
          ? "ACTIVE"
          : "EXPIRED",
    })),
    activity: {
      downloadsTotal: num(a?.downloads_total),
      downloads30d: num(a?.downloads_30d),
      reelsTotal: num(a?.reels_total),
      reels30d: num(a?.reels_30d),
      lastReelAt: a?.last_reel_at ?? null,
      searches30d: num(a?.searches_30d),
      lastActiveAt: a?.last_active ?? null,
    },
  };
};

// ─── Music entity downloads ──────────────────────────────────────────────────
// Who and what is behind an artist / genre / language download count on the
// Music Insights page: per-track and per-user rows for the entity, in range.
export const getFounderMusicEntityService = async (
  params: DateRange & { type: string; name: string },
) => {
  // Base joins: licenses → tracks, then the entity mapping.
  const entityJoin =
    params.type === "artist"
      ? `JOIN track_artist_mappings tam ON tam."trackId" = t.id AND tam."isPrimary" IS TRUE
         JOIN artists ent ON ent.id = tam."artistId" AND ent.name = :name`
      : `JOIN track_filter_mappings tfm ON tfm."trackId" = t.id
         JOIN filters ent ON ent.id = tfm."filterId"
           AND ent.type = '${params.type === "genre" ? "genre" : "language"}'
           AND ent.name = :name`;

  const [tracks, users] = await Promise.all([
    q<{ track_code: string; track_name: string | null; downloads: string }>(
      `SELECT l."trackCode" AS track_code, MAX(t.name) AS track_name,
              COUNT(*) AS downloads
       FROM licenses l
       ${customerBrandJoin('l."brandId"')}
       JOIN tracks t ON t."trackCode" = l."trackCode"
       ${entityJoin}
       WHERE ${inRange(`l."licensedAt"`)}
       GROUP BY 1 ORDER BY 2 DESC`,
      params,
    ),
    q<{
      user_id: string; user_name: string | null; email: string;
      brand_name: string; downloads: string; last_downloaded_at: string;
    }>(
      `SELECT u.id AS user_id, ${USER_NAME_SQL} AS user_name, u.email,
              cb.name AS brand_name,
              COUNT(*) AS downloads,
              MAX(l."licensedAt") AS last_downloaded_at
       FROM licenses l
       ${customerBrandJoin('l."brandId"')}
       JOIN users u ON u.id = l."userId"
       JOIN tracks t ON t."trackCode" = l."trackCode"
       ${entityJoin}
       WHERE ${inRange(`l."licensedAt"`)}
       GROUP BY 1, 2, 3, 4
       ORDER BY downloads DESC, last_downloaded_at DESC`,
      params,
    ),
  ]);

  return {
    type: params.type,
    name: params.name,
    tracks: tracks.map((r) => ({
      trackCode: r.track_code,
      name: r.track_name ?? r.track_code,
      downloads: num(r.downloads),
    })),
    users: users.map((r) => ({
      userId: num(r.user_id),
      name: r.user_name ?? r.email,
      email: r.email,
      brandName: r.brand_name,
      downloads: num(r.downloads),
      lastDownloadedAt: r.last_downloaded_at,
    })),
  };
};

// ─── Engagement per-brand ────────────────────────────────────────────────────
// The per-brand rows behind the Engagement averages and histograms: tokens
// spent, downloads, reels, and active weeks within the range, for every
// customer brand.
export const getFounderEngagementBrandsService = async (range: DateRange) => {
  const rows = await q<{
    brand_id: string; brand_name: string; tokens: string; downloads: string;
    reels: string; active_weeks: string;
  }>(
    `SELECT b.id AS brand_id, b.name AS brand_name,
            COALESCE((SELECT SUM(td."deductedTokenCount")
                      FROM token_deduction td
                      JOIN token_assigned ta ON ta.id = td."tokenAssignedId"
                      WHERE ta."brandId" = b.id AND ${inRange(`td."deductedAt"`)}), 0) AS tokens,
            (SELECT COUNT(*) FROM licenses l
             WHERE l."brandId" = b.id AND ${inRange(`l."licensedAt"`)}) AS downloads,
            (SELECT COUNT(*) FROM video_links vl
             WHERE vl."brandId" = b.id AND ${inRange(`vl."createdAt"`)}) AS reels,
            (SELECT COUNT(DISTINCT date_trunc('week', s."createdAt"))
             FROM user_sessions s
             JOIN users u ON u.id = s."userId"
             WHERE u."brandId" = b.id AND ${inRange(`s."createdAt"`)}) AS active_weeks
     FROM ${ACTIVE_BRANDS}
     ORDER BY tokens DESC, reels DESC, b.name ASC`,
    range,
  );
  return {
    brands: rows.map((r) => ({
      brandId: num(r.brand_id),
      brandName: r.brand_name,
      tokensSpent: num(r.tokens),
      downloads: num(r.downloads),
      reels: num(r.reels),
      activeWeeks: num(r.active_weeks),
    })),
  };
};

// ─── Funnel-stage brand lists ────────────────────────────────────────────────
// scope=adoption → all-time onboarding funnel (Overview page); mirrors
// getFounderFunnelService's brand_flags exactly.
// scope=search → the windowed search→reel funnel (Product page); mirrors
// getProductFunnelService's brand_stage exactly.

const ADOPTION_STAGES: Record<string, string> = {
  onboarded: "TRUE",
  first_login: "logged_in",
  first_search: "searched",
  first_preview: "previewed",
  first_download: "downloaded",
  first_reel: "reeled",
  monthly_active: "monthly_active",
};

const SEARCH_STAGES: Record<string, string> = {
  searched: "searched",
  previewed: "searched AND previewed",
  downloaded: "searched AND downloaded",
  reeled: "searched AND downloaded AND reeled",
};

export const getFounderFunnelBrandsService = async (
  params: DateRange & { scope: string; stage: string },
) => {
  const isAdoption = params.scope === "adoption";
  const pred = isAdoption
    ? ADOPTION_STAGES[params.stage] ?? "TRUE"
    : SEARCH_STAGES[params.stage] ?? "searched";

  const cte = isAdoption
    ? `SELECT
         b.id, b.name, b."createdAt" AS onboarded_at,
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
       FROM ${ACTIVE_BRANDS}`
    : `SELECT
         b.id, b.name, b."createdAt" AS onboarded_at,
         EXISTS (SELECT 1 FROM brand_search_history sh
                 WHERE sh."brandId" = b.id AND ${inRange(`sh."createdAt"`)}) AS searched,
         EXISTS (SELECT 1 FROM users u JOIN user_stream_history ush ON ush."userId" = u.id
                 WHERE u."brandId" = b.id AND ush."streamType" IN ('PREVIEW', 'PLAY')
                   AND ${inRange(`ush."lastStreamedAt"`)}) AS previewed,
         EXISTS (SELECT 1 FROM licenses l
                 WHERE l."brandId" = b.id AND ${inRange(`l."licensedAt"`)}) AS downloaded,
         EXISTS (SELECT 1 FROM video_links vl
                 WHERE vl."brandId" = b.id AND ${inRange(`vl."createdAt"`)}) AS reeled
       FROM ${ACTIVE_BRANDS}`;

  const rows = await q<{
    id: string; name: string; onboarded_at: string; last_active: string | null;
  }>(
    `WITH brand_flags AS (${cte})
     SELECT bf.id, bf.name, bf.onboarded_at,
            GREATEST(
              (SELECT MAX(u."lastLoginAt") FROM users u WHERE u."brandId" = bf.id),
              (SELECT MAX(s."createdAt") FROM user_sessions s
               JOIN users u ON u.id = s."userId" WHERE u."brandId" = bf.id)
            ) AS last_active
     FROM brand_flags bf
     WHERE ${pred}
     ORDER BY bf.name ASC`,
    params,
  );

  return {
    scope: isAdoption ? "adoption" : "search",
    stage: params.stage,
    brands: rows.map((r) => ({
      brandId: num(r.id),
      brandName: r.name,
      onboardedAt: r.onboarded_at,
      lastActiveAt: r.last_active,
    })),
  };
};

// ─── Search-query detail ─────────────────────────────────────────────────────
// Which brands and users searched a given query in the range.
export const getProductQueryDetailService = async (
  params: DateRange & { query: string },
) => {
  const [brands, users] = await Promise.all([
    q<{ brand_id: string; brand_name: string; searches: string; last_searched_at: string }>(
      `SELECT sh."brandId" AS brand_id, MAX(sh."brandName") AS brand_name,
              COUNT(*) AS searches, MAX(sh."createdAt") AS last_searched_at
       FROM brand_search_history sh
       ${customerBrandJoin('sh."brandId"')}
       WHERE ${inRange(`sh."createdAt"`)}
         AND LOWER(TRIM(sh.query)) = LOWER(TRIM(:query))
       GROUP BY 1 ORDER BY 2 DESC`,
      params,
    ),
    q<{
      user_id: string; user_name: string | null; email: string;
      brand_name: string; searches: string; last_searched_at: string;
    }>(
      `SELECT u.id AS user_id, ${USER_NAME_SQL} AS user_name, u.email,
              cb.name AS brand_name,
              COUNT(*) AS searches, MAX(sh."createdAt") AS last_searched_at
       FROM brand_search_history sh
       ${customerBrandJoin('sh."brandId"')}
       JOIN users u ON u.id = sh."userId"
       WHERE ${inRange(`sh."createdAt"`)}
         AND LOWER(TRIM(sh.query)) = LOWER(TRIM(:query))
       GROUP BY 1, 2, 3, 4
       ORDER BY searches DESC, last_searched_at DESC`,
      params,
    ),
  ]);
  return {
    query: params.query,
    brands: brands.map((r) => ({
      brandId: num(r.brand_id),
      brandName: r.brand_name,
      searches: num(r.searches),
      lastSearchedAt: r.last_searched_at,
    })),
    users: users.map((r) => ({
      userId: num(r.user_id),
      name: r.user_name ?? r.email,
      email: r.email,
      brandName: r.brand_name,
      searches: num(r.searches),
      lastSearchedAt: r.last_searched_at,
    })),
  };
};

// ─── Feature-adoption brand lists ────────────────────────────────────────────
// The brands behind each Feature Adoption bar on Product · Behavior, with an
// event count per brand. Feature keys mirror getProductBehaviorService.
const FEATURE_COUNTS: Record<string, string> = {
  search: `(SELECT COUNT(*) FROM brand_search_history sh
            WHERE sh."brandId" = b.id AND #RANGE(sh."createdAt"))`,
  filters: `(SELECT COUNT(*) FROM brand_search_history sh
             WHERE sh."brandId" = b.id AND #RANGE(sh."createdAt")
               AND sh.filters IS NOT NULL AND jsonb_array_length(sh.filters) > 0)`,
  preview: `(SELECT COUNT(*) FROM users u JOIN user_stream_history ush ON ush."userId" = u.id
             WHERE u."brandId" = b.id AND ush."streamType" IN ('PREVIEW', 'PLAY')
               AND #RANGE(ush."lastStreamedAt"))`,
  download: `(SELECT COUNT(*) FROM licenses l
              WHERE l."brandId" = b.id AND #RANGE(l."licensedAt"))`,
  reel: `(SELECT COUNT(*) FROM video_links vl
          WHERE vl."brandId" = b.id AND #RANGE(vl."createdAt"))`,
};

export const getProductFeatureBrandsService = async (
  params: DateRange & { feature: string },
) => {
  const template = FEATURE_COUNTS[params.feature] ?? FEATURE_COUNTS.search;
  const countExpr = template.replace(/#RANGE\(([^)]+)\)/g, (_, col) => inRange(col));

  const rows = await q<{ brand_id: string; brand_name: string; events: string }>(
    `SELECT b.id AS brand_id, b.name AS brand_name, ${countExpr} AS events
     FROM ${ACTIVE_BRANDS}
     ORDER BY events DESC, b.name ASC`,
    params,
  );

  return {
    feature: params.feature,
    brands: rows
      .map((r) => ({
        brandId: num(r.brand_id),
        brandName: r.brand_name,
        events: num(r.events),
      }))
      .filter((r) => r.events > 0),
  };
};
