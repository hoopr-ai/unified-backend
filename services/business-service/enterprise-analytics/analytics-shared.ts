import { QueryTypes } from "sequelize";
import { sequelize } from "../../persistence-service/database";
import { INTERNAL_BRAND_IDS } from "../../helper-service/internal-brands.helper";

// ─── Enterprise analytics shared helpers ─────────────────────────────────────
//
// Read-only aggregates for the internal-fe "Enterprise Analytics" dashboards
// (Founder / Customer Success / Product). The account population is
// `brands.status = 'ACTIVE'`; brand users are `users.brandId = b.id` with
// platform ENTERPRISE. All queries are raw SQL against the shared Postgres —
// columns are camelCase, so identifiers must be quoted.
//
// Data-source notes that shape every metric here:
// - Downloads = `licenses` rows (1 license = 1 track download); token spend =
//   `token_deduction` (reason LICENSE_PURCHASE ties to a license). Summing
//   "deductedTokenCount"/"tokenCost" keeps tiered pricing correct.
// - Reels = `video_links` rows (reel-link submissions, FK to licenses).
// - Searches = `brand_search_history` — written by content-recommendation into
//   this same database. Rows older than 90 days are purged per brand, so any
//   "first search" or long-range search trend is bounded to ~3 months.
// - Previews = `user_stream_history` (streamType PREVIEW) is aggregated per
//   (user, track) with a count + lastStreamedAt, not an event log — in-range
//   preview activity uses lastStreamedAt/createdAt and is approximate.
// - Packs = `token_assigned` ("kitty"); unlimited packs are excluded from all
//   utilization/depletion math. Pack "expiryDate" doubles as the renewal date
//   (no separate renewal entity exists by design — no schema changes).
//
// Dates arrive as inclusive IST calendar days (YYYY-MM-DD).

export const RANGE_START = `((:startDate)::timestamp AT TIME ZONE 'Asia/Kolkata')`;
export const RANGE_END = `(((:endDate)::date + 1)::timestamp AT TIME ZONE 'Asia/Kolkata')`;
export const inRange = (col: string): string =>
  `${col} >= ${RANGE_START} AND ${col} < ${RANGE_END}`;
export const istDay = (col: string): string =>
  `to_char(${col} AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD')`;
export const istMonth = (col: string): string =>
  `to_char(${col} AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM')`;
export const istWeek = (col: string): string =>
  `to_char(date_trunc('week', ${col} AT TIME ZONE 'Asia/Kolkata'), 'YYYY-MM-DD')`;

export const q = async <T>(
  sql: string,
  replacements: Record<string, unknown> = {},
): Promise<T[]> =>
  sequelize.query(sql, {
    replacements: { ...replacements },
    type: QueryTypes.SELECT,
  }) as unknown as Promise<T[]>;

export const num = (v: unknown): number =>
  v === null || v === undefined ? 0 : Number(v);

export const pct = (part: number, whole: number): number =>
  whole > 0 ? Math.round((part / whole) * 10000) / 100 : 0;

export const round1 = (v: number): number => Math.round(v * 10) / 10;

export interface DateRange {
  startDate: string;
  endDate: string;
  [key: string]: unknown;
}

// ─── Brand population ────────────────────────────────────────────────────────
//
// A brand only counts as a CUSTOMER when it has (or ever had) a token pack —
// "accounts with tokens", past or present. Active brands that never got a
// pack are LEADS — they appear only on the Leads page, never in dashboard
// metrics. Two exclusions apply everywhere (customers AND leads): Hoopr-owned
// internal brand ids (helper-service/internal-brands.helper.ts) and any brand
// with a @gsharp.media user (internal test accounts).

const INTERNAL_IDS_SQL = INTERNAL_BRAND_IDS.join(", ");

export const brandExclusions = (alias = "b"): string => `
  ${alias}.id NOT IN (${INTERNAL_IDS_SQL})
  AND NOT EXISTS (
    SELECT 1 FROM users xg
    WHERE xg."brandId" = ${alias}.id AND xg.email ILIKE '%@gsharp.media'
  )`;

export const isCustomer = (alias = "b"): string => `(
  EXISTS (SELECT 1 FROM token_assigned xt WHERE xt."brandId" = ${alias}.id)
)`;

export const customerPred = (alias = "b"): string =>
  `${alias}.status = 'ACTIVE' AND ${brandExclusions(alias)} AND ${isCustomer(alias)}`;

// "Native" tokens = Hoopr Originals catalogue packs. The pack `type` column is
// a free string with legacy casing variants, so match case-insensitively.
export const isNativePack = (alias = "ta"): string =>
  `LOWER(TRIM(${alias}."type")) = 'hoopr originals'`;

// Join snippet for event-table queries (deductions, licenses, video_links,
// searches, sessions) so internal/lead activity never leaks into metrics.
export const customerBrandJoin = (fkExpr: string, alias = "cb"): string =>
  `JOIN brands ${alias} ON ${alias}.id = ${fkExpr} AND ${customerPred(alias)}`;

// Customer enterprise brands — every dashboard metric scopes to this set.
// Kept in the `brands b WHERE <pred>` shape so callers can append `AND ...`.
export const ACTIVE_BRANDS = `brands b WHERE ${customerPred("b")}`;

// ─── Health score (computed, never stored) ───────────────────────────────────
//
// Adapted from the analytics-framework deck: 7 signals, max 95 pts (the
// support-ticket penalty is omitted — no ticket data exists).
//   +25 reel submitted in last 30d          +15 download in last 30d
//   +15 login in last 7d                    +10 2+ reels in last 90d
//   +10 active 3 of last 4 weeks            +10 searched in last 30d
//   +10 2+ seats active in last 30d
// Bands: >=80 Healthy, 50–79 Moderate, <50 At-Risk. A brand whose nearest
// active pack expires within 45 days of :refDate drops one full band
// (escalation multiplier, not a score input).
//
// The CTE is parameterized on refDate so "score as of last week" (for the
// week-over-week drop alert) reuses the same SQL; `p` prefixes the CTE names
// so two snapshots can coexist in one WITH clause.
export const healthCte = (refDate: string, p = ""): string => `
  ${p}health_signals AS (
    SELECT
      b.id AS brand_id,
      EXISTS (
        SELECT 1 FROM video_links vl
        WHERE vl."brandId" = b.id
          AND vl."createdAt" >= ${refDate} - INTERVAL '30 days'
          AND vl."createdAt" < ${refDate}
      ) AS reel_30d,
      (
        SELECT COUNT(*) FROM video_links vl
        WHERE vl."brandId" = b.id
          AND vl."createdAt" >= ${refDate} - INTERVAL '90 days'
          AND vl."createdAt" < ${refDate}
      ) AS reels_90d,
      EXISTS (
        SELECT 1 FROM licenses l
        WHERE l."brandId" = b.id
          AND l."licensedAt" >= ${refDate} - INTERVAL '30 days'
          AND l."licensedAt" < ${refDate}
      ) AS download_30d,
      EXISTS (
        SELECT 1 FROM user_sessions s
        JOIN users u ON u.id = s."userId"
        WHERE u."brandId" = b.id
          AND s."createdAt" >= ${refDate} - INTERVAL '7 days'
          AND s."createdAt" < ${refDate}
      ) AS login_7d,
      (
        SELECT COUNT(DISTINCT date_trunc('week', s."createdAt"))
        FROM user_sessions s
        JOIN users u ON u.id = s."userId"
        WHERE u."brandId" = b.id
          AND s."createdAt" >= ${refDate} - INTERVAL '28 days'
          AND s."createdAt" < ${refDate}
      ) AS active_weeks_4w,
      EXISTS (
        SELECT 1 FROM brand_search_history sh
        WHERE sh."brandId" = b.id
          AND sh."createdAt" >= ${refDate} - INTERVAL '30 days'
          AND sh."createdAt" < ${refDate}
      ) AS search_30d,
      (
        SELECT COUNT(DISTINCT s."userId") FROM user_sessions s
        JOIN users u ON u.id = s."userId"
        WHERE u."brandId" = b.id
          AND s."createdAt" >= ${refDate} - INTERVAL '30 days'
          AND s."createdAt" < ${refDate}
      ) AS active_seats_30d,
      (
        SELECT MIN(ta."expiryDate") FROM token_assigned ta
        WHERE ta."brandId" = b.id
          AND ta."expiryDate" IS NOT NULL
          AND ta."expiryDate" >= ${refDate}
      ) AS next_expiry
    FROM ${ACTIVE_BRANDS}
  ),
  ${p}health AS (
    SELECT
      brand_id,
      (CASE WHEN reel_30d THEN 25 ELSE 0 END
       + CASE WHEN download_30d THEN 15 ELSE 0 END
       + CASE WHEN login_7d THEN 15 ELSE 0 END
       + CASE WHEN reels_90d >= 2 THEN 10 ELSE 0 END
       + CASE WHEN active_weeks_4w >= 3 THEN 10 ELSE 0 END
       + CASE WHEN search_30d THEN 10 ELSE 0 END
       + CASE WHEN active_seats_30d >= 2 THEN 10 ELSE 0 END) AS score,
      (next_expiry IS NOT NULL
       AND next_expiry < ${refDate} + INTERVAL '45 days') AS renewal_soon
    FROM ${p}health_signals
  ),
  ${p}health_banded AS (
    SELECT
      brand_id,
      score,
      renewal_soon,
      CASE
        WHEN score >= 80 AND NOT renewal_soon THEN 'HEALTHY'
        WHEN score >= 80 AND renewal_soon THEN 'MODERATE'
        WHEN score >= 50 AND NOT renewal_soon THEN 'MODERATE'
        ELSE 'AT_RISK'
      END AS tier
    FROM ${p}health
  )`;

export const HEALTH_NOW = healthCte("NOW()");
