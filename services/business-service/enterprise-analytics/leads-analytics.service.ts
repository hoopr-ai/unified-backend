import { q, num, brandExclusions, isCustomer } from "./analytics-shared";

// ─── Leads ───────────────────────────────────────────────────────────────────
// Active brands that are NOT customers yet: no token pack ever assigned and no
// license (download). They're excluded from every dashboard metric and dumped
// here instead — a pipeline list for sales/CS follow-up. The same global
// exclusions apply (internal brand ids, @gsharp.media test brands).

interface LeadRow {
  brand_id: string;
  brand_name: string;
  organization_name: string | null;
  onboarded_at: string;
  seats: string;
  emails: string | null;
  last_active: string | null;
  sessions_30d: string;
  searches_90d: string;
  tracks_played: string;
}

export const getLeadsService = async (filters: { search?: string }) => {
  const rows = await q<LeadRow>(
    `SELECT b.id AS brand_id,
            b.name AS brand_name,
            o.name AS organization_name,
            b."createdAt" AS onboarded_at,
            (SELECT COUNT(*) FROM users u WHERE u."brandId" = b.id) AS seats,
            (SELECT string_agg(DISTINCT u.email, ', ') FROM users u
             WHERE u."brandId" = b.id AND u.email IS NOT NULL) AS emails,
            GREATEST(
              (SELECT MAX(u."lastLoginAt") FROM users u WHERE u."brandId" = b.id),
              (SELECT MAX(s."createdAt") FROM user_sessions s
               JOIN users u ON u.id = s."userId" WHERE u."brandId" = b.id)
            ) AS last_active,
            (SELECT COUNT(*) FROM user_sessions s
             JOIN users u ON u.id = s."userId"
             WHERE u."brandId" = b.id
               AND s."createdAt" >= NOW() - INTERVAL '30 days') AS sessions_30d,
            (SELECT COUNT(*) FROM brand_search_history sh
             WHERE sh."brandId" = b.id) AS searches_90d,
            (SELECT COUNT(DISTINCT ush."trackCode")
             FROM users u JOIN user_stream_history ush ON ush."userId" = u.id
             WHERE u."brandId" = b.id) AS tracks_played
     FROM brands b
     LEFT JOIN organizations o ON o.id = b."organizationId"
     WHERE b.status = 'ACTIVE'
       AND ${brandExclusions("b")}
       AND NOT ${isCustomer("b")}
     ORDER BY last_active DESC NULLS LAST, b."createdAt" DESC`,
  );

  let leads = rows.map((r) => ({
    brandId: num(r.brand_id),
    brandName: r.brand_name,
    organizationName: r.organization_name,
    onboardedAt: r.onboarded_at,
    seats: num(r.seats),
    emails: r.emails,
    lastActiveAt: r.last_active,
    sessions30d: num(r.sessions_30d),
    searches90d: num(r.searches_90d),
    tracksPlayed: num(r.tracks_played),
  }));

  if (filters.search) {
    const needle = filters.search.toLowerCase();
    leads = leads.filter(
      (l) =>
        l.brandName.toLowerCase().includes(needle) ||
        (l.emails ?? "").toLowerCase().includes(needle) ||
        (l.organizationName ?? "").toLowerCase().includes(needle),
    );
  }

  const now = Date.now();
  const activeLast30d = leads.filter(
    (l) =>
      l.lastActiveAt !== null &&
      now - new Date(l.lastActiveAt).getTime() <= 30 * 86400_000,
  ).length;

  return {
    leads,
    totalCount: leads.length,
    summary: {
      total: leads.length,
      activeLast30d,
      searchedRecently: leads.filter((l) => l.searches90d > 0).length,
      neverLoggedIn: leads.filter((l) => l.lastActiveAt === null).length,
    },
  };
};
