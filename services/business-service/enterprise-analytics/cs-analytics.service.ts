import {
  q,
  num,
  pct,
  round1,
  ACTIVE_BRANDS,
  HEALTH_NOW,
  healthCte,
  customerPred,
  brandExclusions,
} from "./analytics-shared";

// ─── Customer Success dashboard ──────────────────────────────────────────────
// An operational worklist: one row per brand with kitty, burn, health, and
// recency, plus auto-surfaced alert lists. No CSM-assignment or ticket data
// exists (by design, no schema changes), so those spec columns are omitted.

// Per-brand account facts shared by the table and the alert lists. Finite,
// in-force packs only; burn rate = trailing 28-day token spend / 4.
const ACCOUNT_CTE = `
  packs AS (
    SELECT ta."brandId" AS brand_id,
           SUM(ta."totalAssignedToken") AS issued,
           SUM(ta."tokenBalance") AS balance,
           MIN(ta."expiryDate") AS next_expiry,
           MIN(ta."createdAt") AS first_pack_at,
           BOOL_OR(ta."isUnlimited" IS TRUE) AS has_unlimited
    FROM token_assigned ta
    WHERE (ta."expiryDate" IS NULL OR ta."expiryDate" >= NOW())
    GROUP BY 1
  ),
  burn AS (
    SELECT ta."brandId" AS brand_id,
           SUM(td."deductedTokenCount") / 4.0 AS weekly_burn
    FROM token_deduction td
    JOIN token_assigned ta ON ta.id = td."tokenAssignedId"
    WHERE td."deductedAt" >= NOW() - INTERVAL '28 days'
    GROUP BY 1
  ),
  recency AS (
    SELECT b.id AS brand_id,
           GREATEST(
             (SELECT MAX(u."lastLoginAt") FROM users u WHERE u."brandId" = b.id),
             (SELECT MAX(s."createdAt") FROM user_sessions s
              JOIN users u ON u.id = s."userId" WHERE u."brandId" = b.id)
           ) AS last_active,
           (SELECT MAX(vl."createdAt") FROM video_links vl WHERE vl."brandId" = b.id) AS last_reel,
           (SELECT COUNT(*) FROM users u WHERE u."brandId" = b.id AND u.status = 'ACTIVE') AS seats,
           (SELECT COUNT(DISTINCT s."userId") FROM user_sessions s
            JOIN users u ON u.id = s."userId"
            WHERE u."brandId" = b.id AND s."createdAt" >= NOW() - INTERVAL '30 days') AS active_seats,
           (SELECT COUNT(*) FROM licenses l WHERE l."brandId" = b.id
            AND l."licensedAt" >= NOW() - INTERVAL '30 days') AS downloads_30d,
           (SELECT COUNT(*) FROM video_links vl WHERE vl."brandId" = b.id
            AND vl."createdAt" >= NOW() - INTERVAL '30 days') AS reels_30d,
           (SELECT COUNT(*) FROM brand_search_history sh WHERE sh."brandId" = b.id
            AND sh."createdAt" >= NOW() - INTERVAL '30 days') AS searches_30d
    FROM ${ACTIVE_BRANDS}
  )`;

interface AccountRow {
  brand_id: string;
  brand_name: string;
  issued: string | null;
  balance: string | null;
  has_unlimited: boolean | null;
  next_expiry: string | null;
  first_pack_at: string | null;
  weekly_burn: string | null;
  last_active: string | null;
  last_reel: string | null;
  seats: string;
  active_seats: string;
  downloads_30d: string;
  reels_30d: string;
  searches_30d: string;
  score: string;
  tier: string;
  prev_score: string;
}

const toAccount = (r: AccountRow) => {
  const issued = num(r.issued);
  const balance = num(r.balance);
  const weeklyBurn = round1(num(r.weekly_burn));
  const dailyBurn = num(r.weekly_burn) / 7;
  const estDepletionDays =
    !r.has_unlimited && balance > 0 && dailyBurn > 0
      ? Math.round(balance / dailyBurn)
      : null;
  return {
    brandId: num(r.brand_id),
    brandName: r.brand_name,
    hasUnlimitedPack: r.has_unlimited === true,
    tokensIssued: issued,
    tokensLeft: balance,
    kittyBalancePct: issued > 0 ? pct(balance, issued) : null,
    utilizationPct: issued > 0 ? pct(issued - balance, issued) : null,
    weeklyBurnRate: weeklyBurn,
    estDepletionDays,
    estDepletionDate: estDepletionDays
      ? new Date(Date.now() + estDepletionDays * 86400_000).toISOString().slice(0, 10)
      : null,
    healthScore: num(r.score),
    healthTier: r.tier,
    healthScorePrevWeek: num(r.prev_score),
    lastActiveAt: r.last_active,
    lastReelAt: r.last_reel,
    renewalDate: r.next_expiry,
    daysUntilRenewal: r.next_expiry
      ? Math.ceil((new Date(r.next_expiry).getTime() - Date.now()) / 86400_000)
      : null,
    packAgeDays: r.first_pack_at
      ? Math.floor((Date.now() - new Date(r.first_pack_at).getTime()) / 86400_000)
      : null,
    seats: num(r.seats),
    activeSeats30d: num(r.active_seats),
    downloads30d: num(r.downloads_30d),
    reels30d: num(r.reels_30d),
    searches30d: num(r.searches_30d),
  };
};

export type Account = ReturnType<typeof toAccount>;

const fetchAccounts = async (): Promise<Account[]> => {
  // health as-of now plus as-of 7 days ago (for the WoW-drop alert).
  const prevHealth = healthCte("(NOW() - INTERVAL '7 days')", "prev_");

  const rows = await q<AccountRow>(
    `WITH ${HEALTH_NOW}, ${prevHealth}, ${ACCOUNT_CTE}
     SELECT b.id AS brand_id, b.name AS brand_name,
            p.issued, p.balance, p.has_unlimited, p.next_expiry, p.first_pack_at,
            bu.weekly_burn,
            r.last_active, r.last_reel, r.seats, r.active_seats,
            r.downloads_30d, r.reels_30d, r.searches_30d,
            hb.score, hb.tier,
            phb.score AS prev_score
     FROM brands b
     LEFT JOIN packs p ON p.brand_id = b.id
     LEFT JOIN burn bu ON bu.brand_id = b.id
     JOIN recency r ON r.brand_id = b.id
     JOIN health_banded hb ON hb.brand_id = b.id
     JOIN prev_health_banded phb ON phb.brand_id = b.id
     WHERE ${customerPred("b")}
     ORDER BY hb.score ASC, b.name ASC`,
  );
  return rows.map(toAccount);
};

// GET /cs/accounts — the core worklist table.
export const getCsAccountsService = async (filters: {
  search?: string;
  healthTier?: string;
}) => {
  let accounts = await fetchAccounts();
  if (filters.search) {
    const needle = filters.search.toLowerCase();
    accounts = accounts.filter((a) => a.brandName.toLowerCase().includes(needle));
  }
  if (filters.healthTier) {
    accounts = accounts.filter((a) => a.healthTier === filters.healthTier);
  }
  return { accounts, totalCount: accounts.length };
};

// ─── Accounts with tokens (past or present) ──────────────────────────────────
// Every brand that has EVER been assigned a token pack — including packs that
// have since expired. Lifetime issued/consumed plus current pack status.
// Unlike the worklist above, this does not require an in-force pack or an
// ACTIVE brand (churned accounts belong here too); only the standard internal
// brand exclusions apply. Brand status is surfaced so churn is visible.

interface TokenAccountRow {
  brand_id: string;
  brand_name: string;
  brand_status: string;
  packs: string;
  issued: string | null;
  balance: string | null;
  usable_balance: string | null;
  has_unlimited: boolean | null;
  has_active_pack: boolean | null;
  first_pack_at: string | null;
  last_pack_at: string | null;
  latest_expiry: string | null;
}

const toTokenAccount = (r: TokenAccountRow) => {
  const issued = num(r.issued);
  const balance = num(r.balance);
  const consumed = Math.max(issued - balance, 0);
  return {
    brandId: num(r.brand_id),
    brandName: r.brand_name,
    brandStatus: r.brand_status,
    packStatus: r.has_active_pack === true ? "ACTIVE" : "EXPIRED",
    hasUnlimitedPack: r.has_unlimited === true,
    totalPacks: num(r.packs),
    tokensIssuedLifetime: issued,
    tokensConsumedLifetime: consumed,
    // Balance still spendable today — expired packs' leftover tokens are dead.
    tokensLeft: num(r.usable_balance),
    utilizationPct: issued > 0 ? pct(consumed, issued) : null,
    firstPackAt: r.first_pack_at,
    lastPackAt: r.last_pack_at,
    latestExpiryDate: r.latest_expiry,
  };
};

export type TokenAccount = ReturnType<typeof toTokenAccount>;

// GET /cs/token-accounts — accounts with a past or present token pack.
export const getCsTokenAccountsService = async (filters: {
  search?: string;
  packStatus?: string;
}) => {
  const rows = await q<TokenAccountRow>(
    `WITH pack_stats AS (
       SELECT ta."brandId" AS brand_id,
              COUNT(*) AS packs,
              SUM(CASE WHEN ta."isUnlimited" IS TRUE THEN 0
                       ELSE ta."totalAssignedToken" END) AS issued,
              SUM(CASE WHEN ta."isUnlimited" IS TRUE THEN 0
                       ELSE ta."tokenBalance" END) AS balance,
              SUM(CASE WHEN ta."isUnlimited" IS NOT TRUE
                        AND (ta."expiryDate" IS NULL OR ta."expiryDate" >= NOW())
                       THEN ta."tokenBalance" ELSE 0 END) AS usable_balance,
              BOOL_OR(ta."isUnlimited" IS TRUE) AS has_unlimited,
              BOOL_OR(ta."expiryDate" IS NULL OR ta."expiryDate" >= NOW()) AS has_active_pack,
              MIN(ta."createdAt") AS first_pack_at,
              MAX(ta."createdAt") AS last_pack_at,
              MAX(ta."expiryDate") AS latest_expiry
       FROM token_assigned ta
       GROUP BY 1
     )
     SELECT b.id AS brand_id, b.name AS brand_name, b.status AS brand_status,
            ps.packs, ps.issued, ps.balance, ps.usable_balance,
            ps.has_unlimited, ps.has_active_pack,
            ps.first_pack_at, ps.last_pack_at, ps.latest_expiry
     FROM pack_stats ps
     JOIN brands b ON b.id = ps.brand_id
     WHERE ${brandExclusions("b")}
     ORDER BY ps.last_pack_at DESC, b.name ASC`,
  );
  let accounts = rows.map(toTokenAccount);
  if (filters.search) {
    const needle = filters.search.toLowerCase();
    accounts = accounts.filter((a) => a.brandName.toLowerCase().includes(needle));
  }
  if (filters.packStatus) {
    accounts = accounts.filter((a) => a.packStatus === filters.packStatus);
  }
  return { accounts, totalCount: accounts.length };
};

// GET /cs/alerts — the priority worklists, all derived from the same rows.
export const getCsAlertsService = async () => {
  const accounts = await fetchAccounts();
  const now = Date.now();

  const kittyBarelyTouched = accounts.filter(
    (a) =>
      !a.hasUnlimitedPack &&
      a.tokensIssued > 0 &&
      a.utilizationPct !== null &&
      a.utilizationPct < 10 &&
      a.packAgeDays !== null &&
      a.packAgeDays >= 45,
  );

  const fastDepleting = accounts.filter(
    (a) => a.estDepletionDays !== null && a.estDepletionDays <= 15,
  );

  const noLogin14d = accounts.filter(
    (a) =>
      a.lastActiveAt === null ||
      now - new Date(a.lastActiveAt).getTime() > 14 * 86400_000,
  );

  const noReelDespiteDownloads = accounts.filter(
    (a) => a.downloads30d >= 2 && a.reels30d === 0,
  );

  const renewalDue = accounts
    .filter((a) => a.daysUntilRenewal !== null && a.daysUntilRenewal <= 45 && a.daysUntilRenewal >= 0)
    .map((a) => ({
      ...a,
      renewalTier: a.daysUntilRenewal! <= 15 ? 15 : a.daysUntilRenewal! <= 30 ? 30 : 45,
    }));

  const healthDropped = accounts.filter(
    (a) => a.healthScorePrevWeek - a.healthScore >= 15,
  );

  // Revenue list, kept separate from risk: healthy + burning fast.
  const expansionReady = accounts.filter(
    (a) =>
      a.healthTier === "HEALTHY" &&
      a.utilizationPct !== null &&
      a.utilizationPct >= 70,
  );

  return {
    kittyBarelyTouched,
    fastDepleting,
    noLogin14d,
    noReelDespiteDownloads,
    renewalDue,
    healthDropped,
    expansionReady,
  };
};
