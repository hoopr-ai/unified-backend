import { QueryTypes } from "sequelize";
import { sequelize } from "../../persistence-service/database";

// ─── Smash IPRS reporting ────────────────────────────────────────────────────
//
// Read-only royalty reporting for the internal-fe "IPRS" module under Smash.
// Mirrors the Studio Dashboard → Payouts view (selling price → net of GST →
// owner / Hoopr / IPRS split), but over the SMASH book instead of the label
// book: `licenses` rows belonging to ENTERPRISE users.
//
// ─── The split rule ──────────────────────────────────────────────────────────
//
// Identical to Studio Payouts: a license's value is taken net of GST and then
// split by the TRACK OWNER's configured percentages —
//
//   netOfGst   = gross / (1 + GST_PCT/100)          GST_PCT = 18
//   iprsAmount = netOfGst * owners."IPRS"        / 100
//   ownerAmount= netOfGst * owners."revenueShare"/ 100
//   hooprAmount= netOfGst - iprsAmount - ownerAmount        (the remainder)
//
// On prod today owners."IPRS" is 13 for the 14 IPRS-registered owners and 0
// for everyone else, so "IPRS-liable" == the track's owner is registered.
//
// ─── Where `gross` comes from ────────────────────────────────────────────────
//
// `licenses.price` is NULL for almost every Smash row — B2B licensing is paid
// for with token packs, not per-license money. So a license's gross value is
// derived from the `token_assigned` pack it was spent against, whose two
// pricing shapes are documented in token.service.ts / internal-fe types/tokens.ts:
//
//   dealType 'pricePerTrack' → "pricePerPack" is the per-TOKEN price
//                              → gross = pricePerPack * tokenCost
//   dealType 'bulk'          → "pricePerPack" is the pack TOTAL
//                              → gross = pricePerPack / totalAssignedToken * tokenCost
//
// Not every license can be valued, and this module refuses to invent a number
// for the ones that can't. Each row is tagged with an `attribution` bucket and
// only the three ATTRIBUTABLE buckets contribute to the money totals:
//
//   per_track          priced per-token deal                    → counted
//   bulk_prorata       pack total spread over the pack's tokens → counted
//   direct_payment     no pack, licenses.price paid in money    → counted
//   ── everything below contributes 0 and is reported as a gap ──
//   unpriced_deal      pack exists but was never given a price
//   bulk_unlimited     unlimited pack — no token count to divide a total by
//   unlimited_per_track  per-track price on an unlimited pack. Legacy invalid
//                      data: setTokenAssignedPriceService now rejects exactly
//                      this combination ("Unlimited allocations only support
//                      bulk pricing"). Counting it would let one pack's
//                      per-track price be multiplied by an infinite balance.
//   no_value           no pack and no price (comped / internal)
//
// The coverage block on /overview reports those gaps by count and share so the
// headline is read with its own caveats attached, rather than looking complete.
//
// Separately, `bulk` packs carry a CONTRACTUAL IPRS number on the deal itself
// (token_assigned."iprsShare"). That is the amount actually negotiated with the
// client and is not derivable from the per-license split — /deals reports it
// as its own figure.
//
// Dates are inclusive IST calendar days (YYYY-MM-DD), matching every other
// internal dashboard.

const GST_PCT = 18;

// Owner percentages are stored on `owners`; Hoopr takes whatever the owner and
// IPRS do not. `[1]` picks the first owner — every Smash-licensed track on prod
// has exactly one.
const BASE_CTE = `
  base AS (
    SELECT
      l.id                                   AS "licenseId",
      l."licensedAt",
      l."trackCode",
      l."tokenCost",
      l."brandId",
      l."userId",
      l."type"                               AS "licenseType",
      t.name                                 AS "trackName",
      t."name_slug"                          AS "trackSlug",
      o."ownerCode",
      COALESCE(o.username, o."ownerCode")    AS "ownerName",
      o.type                                 AS "ownerType",
      COALESCE(o."IPRS", 0)::numeric         AS "iprsPct",
      COALESCE(o."revenueShare", 0)::numeric AS "ownerPct",
      b.name                                 AS "brandName",
      u.email                                AS "userEmail",
      ta.id                                  AS "dealId",
      ta."dealType"::text                     AS "dealType",
      ta."keyName",
      ta."isUnlimited",
      ta."pricePerPack",
      ta."totalAssignedToken",
      CASE
        WHEN ta.id IS NULL AND COALESCE(l.price, 0) > 0            THEN 'direct_payment'
        WHEN ta.id IS NULL                                         THEN 'no_value'
        WHEN ta."dealType" = 'pricePerTrack' AND ta."isUnlimited"  THEN 'unlimited_per_track'
        WHEN ta."dealType" = 'pricePerTrack' AND ta."pricePerPack" IS NOT NULL
                                                                   THEN 'per_track'
        WHEN ta."dealType" = 'bulk' AND ta."isUnlimited"           THEN 'bulk_unlimited'
        WHEN ta."dealType" = 'bulk' AND ta."totalAssignedToken" > 0
             AND ta."pricePerPack" IS NOT NULL                     THEN 'bulk_prorata'
        ELSE 'unpriced_deal'
      END AS attribution,
      CASE
        WHEN ta.id IS NULL                                         THEN COALESCE(l.price, 0)
        WHEN ta."dealType" = 'pricePerTrack' AND ta."isUnlimited"  THEN 0
        WHEN ta."dealType" = 'pricePerTrack' AND ta."pricePerPack" IS NOT NULL
                                                                   THEN ta."pricePerPack" * l."tokenCost"
        WHEN ta."dealType" = 'bulk' AND ta."isUnlimited"           THEN 0
        WHEN ta."dealType" = 'bulk' AND ta."totalAssignedToken" > 0
             AND ta."pricePerPack" IS NOT NULL
                                                                   THEN ta."pricePerPack" / ta."totalAssignedToken" * l."tokenCost"
        ELSE 0
      END::numeric AS gross
    FROM licenses l
    JOIN users u        ON u.id = l."userId" AND u.platform = 'ENTERPRISE'
    LEFT JOIN tracks t  ON t."trackCode" = l."trackCode"
    LEFT JOIN owners o  ON o.id = t."ownerId"[1]
    LEFT JOIN brands b  ON b.id = l."brandId"
    LEFT JOIN token_assigned ta ON ta.id = l."tokenId"
  )`;

// Money columns derived off `base`. Kept as one string so every query splits
// identically — a second definition of this arithmetic is a second answer.
const SPLIT_COLS = `
  gross,
  (gross / ${1 + GST_PCT / 100})                              AS "netOfGst",
  (gross / ${1 + GST_PCT / 100} * "iprsPct"  / 100)           AS "iprsAmount",
  (gross / ${1 + GST_PCT / 100} * "ownerPct" / 100)           AS "ownerAmount",
  (gross / ${1 + GST_PCT / 100}
     - gross / ${1 + GST_PCT / 100} * "iprsPct"  / 100
     - gross / ${1 + GST_PCT / 100} * "ownerPct" / 100)       AS "hooprAmount"`;

// Aggregate forms of the same arithmetic, for the GROUP BY endpoints.
const SUM_COLS = `
  COALESCE(SUM(gross), 0)                                              AS gross,
  COALESCE(SUM(gross / ${1 + GST_PCT / 100}), 0)                       AS "netOfGst",
  COALESCE(SUM(gross / ${1 + GST_PCT / 100} * "iprsPct"  / 100), 0)    AS "iprsAmount",
  COALESCE(SUM(gross / ${1 + GST_PCT / 100} * "ownerPct" / 100), 0)    AS "ownerAmount",
  COALESCE(SUM(gross / ${1 + GST_PCT / 100}
     - gross / ${1 + GST_PCT / 100} * "iprsPct"  / 100
     - gross / ${1 + GST_PCT / 100} * "ownerPct" / 100), 0)            AS "hooprAmount"`;

// Buckets whose gross is a real, defensible number.
const ATTRIBUTABLE = `attribution IN ('per_track','bulk_prorata','direct_payment')`;

// IST day boundaries as timestamptz instants, so an indexed "licensedAt" range
// scan still applies.
const RANGE_START = `((:startDate)::timestamp AT TIME ZONE 'Asia/Kolkata')`;
const RANGE_END = `(((:endDate)::date + 1)::timestamp AT TIME ZONE 'Asia/Kolkata')`;

export interface IprsFilters {
  startDate: string;
  endDate: string;
  brandId?: number;
  ownerCode?: string;
  dealType?: string;
  attribution?: string;
  // true  → only rows whose owner carries an IPRS percentage
  // false → only rows whose owner does not
  iprsOnly?: boolean;
  search?: string;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: string;
}

// Every optional filter is expressed as "the bind is NULL, or it matches", so
// one prepared statement serves all filter combinations.
const FILTER_WHERE = `
  "licensedAt" >= ${RANGE_START}
  AND "licensedAt" < ${RANGE_END}
  AND ((:brandId)::bigint IS NULL OR "brandId" = (:brandId)::bigint)
  AND ((:ownerCode)::text IS NULL OR "ownerCode" = (:ownerCode)::text)
  AND ((:dealType)::text IS NULL
       OR (:dealType = 'none' AND "dealId" IS NULL)
       OR "dealType" = (:dealType)::text)
  AND ((:attribution)::text IS NULL OR attribution = (:attribution)::text)
  AND ((:iprsOnly)::boolean IS NULL
       OR ((:iprsOnly)::boolean IS TRUE  AND "iprsPct" > 0)
       OR ((:iprsOnly)::boolean IS FALSE AND "iprsPct" = 0))
  AND ((:search)::text IS NULL
       OR "trackCode" ILIKE '%' || (:search)::text || '%'
       OR "trackName" ILIKE '%' || (:search)::text || '%'
       OR "brandName" ILIKE '%' || (:search)::text || '%'
       OR "ownerName" ILIKE '%' || (:search)::text || '%')`;

// Bind every optional key explicitly — Sequelize throws on a `:name` in the SQL
// with no matching replacement, so a filter left off the request object still
// has to arrive as an explicit null.
const binds = (f: IprsFilters) => ({
  startDate: f.startDate,
  endDate: f.endDate,
  brandId: f.brandId ?? null,
  ownerCode: f.ownerCode ?? null,
  dealType: f.dealType ?? null,
  attribution: f.attribution ?? null,
  iprsOnly: f.iprsOnly ?? null,
  search: f.search?.trim() ? f.search.trim() : null,
});

const q = async <T>(
  sql: string,
  replacements: Record<string, unknown>,
): Promise<T[]> =>
  sequelize.query(sql, {
    replacements,
    type: QueryTypes.SELECT,
  }) as Promise<T[]>;

const num = (v: unknown): number =>
  v === null || v === undefined ? 0 : Number(v);

// Money is reported to paise. Rounding at the edge (not inside SQL) keeps the
// aggregates exact until the moment they are displayed.
const money = (v: unknown): number => Math.round(num(v) * 100) / 100;

const pct = (part: number, whole: number): number =>
  whole > 0 ? Math.round((part / whole) * 10000) / 100 : 0;

const buildPagination = (page: number, limit: number, totalItems: number) => {
  const totalPages = Math.ceil(totalItems / limit);
  return {
    page,
    limit,
    totalItems,
    totalPages,
    hasNextPage: page < totalPages,
    hasPrevPage: page > 1,
  };
};

// Human labels for the attribution buckets, so the FE never restates them.
export const ATTRIBUTION_LABELS: Record<string, string> = {
  per_track: "Per-track deal",
  bulk_prorata: "Bulk pack (pro-rata)",
  direct_payment: "Direct payment",
  unpriced_deal: "Deal has no price set",
  bulk_unlimited: "Unlimited bulk pack",
  unlimited_per_track: "Per-track price on unlimited pack (invalid)",
  no_value: "No pack, no price",
};

const ATTRIBUTABLE_KEYS = ["per_track", "bulk_prorata", "direct_payment"];

// ─── Overview ────────────────────────────────────────────────────────────────

export const getIprsOverviewService = async (filters: IprsFilters) => {
  const b = binds(filters);

  const [totals, sums, coverage, owners, contracted] = await Promise.all([
    // Counts span the WHOLE filtered window, valued or not. Scoping them to
    // attributable rows would make "IPRS-liable licenses" collapse onto
    // "valued IPRS licenses" and hide the exposure the coverage panel exists
    // to show: on prod today 891 licenses are liable but only 81 can be
    // priced. Money below is attributable-only; the two are reported side by
    // side on purpose.
    q<Record<string, string>>(
      `WITH ${BASE_CTE}
       SELECT
         COUNT(*)                                              AS "totalLicenses",
         COUNT(*) FILTER (WHERE "iprsPct" > 0)                 AS "iprsLiableLicenses",
         COUNT(*) FILTER (WHERE ${ATTRIBUTABLE})               AS "valuedLicenses",
         COUNT(*) FILTER (WHERE ${ATTRIBUTABLE} AND "iprsPct" > 0)
                                                               AS "valuedIprsLicenses",
         COUNT(DISTINCT "trackCode")                           AS "tracks",
         COUNT(DISTINCT "trackCode") FILTER (WHERE "iprsPct" > 0)
                                                               AS "iprsTracks",
         COUNT(DISTINCT "brandId")                             AS "brands",
         COUNT(DISTINCT "ownerCode") FILTER (WHERE "iprsPct" > 0)
                                                               AS "iprsOwners"
       FROM base
       WHERE ${FILTER_WHERE}`,
      b,
    ),
    // Money — attributable licenses only, so nothing here rests on a price
    // this module had to invent.
    q<Record<string, string>>(
      `WITH ${BASE_CTE}
       SELECT COALESCE(SUM("tokenCost"), 0) AS "tokensSpent", ${SUM_COLS}
       FROM base
       WHERE ${FILTER_WHERE} AND ${ATTRIBUTABLE}`,
      b,
    ),
    q<{ attribution: string; licenses: string; iprsLiable: string }>(
      `WITH ${BASE_CTE}
       SELECT attribution,
              COUNT(*) AS licenses,
              COUNT(*) FILTER (WHERE "iprsPct" > 0) AS "iprsLiable"
       FROM base
       WHERE ${FILTER_WHERE}
       GROUP BY attribution`,
      b,
    ),
    q<Record<string, string>>(
      `WITH ${BASE_CTE}
       SELECT "ownerCode", "ownerName", "iprsPct",
              COUNT(*) AS licenses, ${SUM_COLS}
       FROM base
       WHERE ${FILTER_WHERE} AND ${ATTRIBUTABLE} AND "iprsPct" > 0
       GROUP BY "ownerCode", "ownerName", "iprsPct"
       ORDER BY "iprsAmount" DESC
       LIMIT 5`,
      b,
    ),
    // Contracted IPRS lives on the bulk packs themselves and is independent of
    // how many licenses were spent against them, so it is NOT date-filtered by
    // "licensedAt" — a pack is dated by when it was created.
    q<Record<string, string>>(
      `SELECT COUNT(*) FILTER (WHERE "iprsShare" IS NOT NULL)      AS "pricedDeals",
              COUNT(*) FILTER (WHERE COALESCE("iprsShare", 0) > 0) AS "iprsDeals",
              COALESCE(SUM("iprsShare"), 0)                        AS "contractedIprs",
              COALESCE(SUM("hooprShare"), 0)                       AS "contractedHoopr",
              COALESCE(SUM("pricePerPack") FILTER (WHERE "dealType" = 'bulk'), 0)
                                                                   AS "contractedPack"
       FROM token_assigned
       WHERE "dealType" = 'bulk'
         AND "createdAt" >= ${RANGE_START}
         AND "createdAt" <  ${RANGE_END}`,
      { startDate: b.startDate, endDate: b.endDate },
    ),
  ]);

  const t = totals[0] ?? {};
  const m = sums[0] ?? {};
  const c = contracted[0] ?? {};

  const allLicenses = num(t.totalLicenses);
  const valued = num(t.valuedLicenses);

  return {
    gstPercent: GST_PCT,
    // Money — attributable licenses only.
    money: {
      gross: money(m.gross),
      netOfGst: money(m.netOfGst),
      iprsPayable: money(m.iprsAmount),
      ownerPayable: money(m.ownerAmount),
      hooprShare: money(m.hooprAmount),
      // What the GST component itself came to, for the finance reconcile.
      gstAmount: money(num(m.gross) - num(m.netOfGst)),
    },
    counts: {
      totalLicenses: allLicenses,
      valuedLicenses: valued,
      iprsLiableLicenses: num(t.iprsLiableLicenses),
      valuedIprsLicenses: num(t.valuedIprsLicenses),
      tracks: num(t.tracks),
      iprsTracks: num(t.iprsTracks),
      brands: num(t.brands),
      iprsOwners: num(t.iprsOwners),
      tokensSpent: num(m.tokensSpent),
    },
    // How much of the book the money figures actually cover. Read the headline
    // with this: `valuedSharePct` well under 100 means the rest of the book has
    // no price attached, not that it earned nothing.
    coverage: {
      valuedSharePct: pct(valued, allLicenses),
      unvaluedLicenses: allLicenses - valued,
      buckets: coverage
        .map((r) => ({
          key: r.attribution,
          label: ATTRIBUTION_LABELS[r.attribution] ?? r.attribution,
          attributable: ATTRIBUTABLE_KEYS.includes(r.attribution),
          licenses: num(r.licenses),
          iprsLiable: num(r.iprsLiable),
          sharePct: pct(num(r.licenses), allLicenses),
        }))
        .sort((x, y) => y.licenses - x.licenses),
    },
    // Contractual IPRS committed on bulk packs — the negotiated number, which
    // the per-license split cannot reproduce.
    contracted: {
      pricedDeals: num(c.pricedDeals),
      iprsDeals: num(c.iprsDeals),
      iprsAmount: money(c.contractedIprs),
      hooprAmount: money(c.contractedHoopr),
      packValue: money(c.contractedPack),
      // Bulk packs are supposed to satisfy iprsShare + hooprShare =
      // pricePerPack. Where they don't, part of the pack value is unassigned.
      unassigned: money(
        num(c.contractedPack) - num(c.contractedIprs) - num(c.contractedHoopr),
      ),
    },
    topOwners: owners.map((r) => ({
      ownerCode: r.ownerCode,
      ownerName: r.ownerName,
      iprsPct: num(r.iprsPct),
      licenses: num(r.licenses),
      iprsAmount: money(r.iprsAmount),
      netOfGst: money(r.netOfGst),
    })),
  };
};

// ─── Monthly trend ───────────────────────────────────────────────────────────

export const getIprsTrendService = async (filters: IprsFilters) => {
  const rows = await q<Record<string, string>>(
    `WITH ${BASE_CTE}
     SELECT to_char("licensedAt" AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM') AS month,
            COUNT(*) AS licenses,
            COUNT(*) FILTER (WHERE "iprsPct" > 0) AS "iprsLicenses",
            ${SUM_COLS}
     FROM base
     WHERE ${FILTER_WHERE} AND ${ATTRIBUTABLE}
     GROUP BY 1
     ORDER BY 1`,
    binds(filters),
  );

  return {
    gstPercent: GST_PCT,
    series: rows.map((r) => ({
      month: r.month,
      licenses: num(r.licenses),
      iprsLicenses: num(r.iprsLicenses),
      gross: money(r.gross),
      netOfGst: money(r.netOfGst),
      iprsAmount: money(r.iprsAmount),
      ownerAmount: money(r.ownerAmount),
      hooprAmount: money(r.hooprAmount),
    })),
  };
};

// ─── Licenses (the Payouts-equivalent ledger) ────────────────────────────────

// Whitelisted sort keys → the expression to sort by. Anything else falls back
// to licensedAt, so a bad `sortBy` can never reach the SQL.
const LICENSE_SORTS: Record<string, string> = {
  licensedAt: `"licensedAt"`,
  trackName: `"trackName"`,
  trackCode: `"trackCode"`,
  brandName: `"brandName"`,
  ownerName: `"ownerName"`,
  gross: `gross`,
  netOfGst: `gross`,
  iprsAmount: `gross * "iprsPct"`,
  ownerAmount: `gross * "ownerPct"`,
};

const orderBy = (sortBy?: string, sortOrder?: string): string => {
  const col = LICENSE_SORTS[sortBy ?? ""] ?? `"licensedAt"`;
  const dir = (sortOrder ?? "desc").toLowerCase() === "asc" ? "ASC" : "DESC";
  // id as a tiebreaker so paging is stable across pages.
  return `${col} ${dir} NULLS LAST, "licenseId" DESC`;
};

interface LicenseRow extends Record<string, string> {}

const mapLicense = (r: LicenseRow) => ({
  licenseId: num(r.licenseId),
  licensedAt: r.licensedAt,
  trackCode: r.trackCode,
  trackName: r.trackName,
  trackSlug: r.trackSlug,
  brandId: r.brandId === null ? null : num(r.brandId),
  brandName: r.brandName,
  ownerCode: r.ownerCode,
  ownerName: r.ownerName,
  ownerType: r.ownerType,
  licenseType: r.licenseType,
  tokenCost: num(r.tokenCost),
  dealId: r.dealId === null ? null : num(r.dealId),
  dealType: r.dealType,
  dealKey: r.keyName,
  isUnlimited: Boolean(r.isUnlimited),
  attribution: r.attribution,
  attributionLabel: ATTRIBUTION_LABELS[r.attribution] ?? r.attribution,
  // Percentages as configured on the owner; Hoopr keeps the remainder.
  iprsPct: num(r.iprsPct),
  ownerPct: num(r.ownerPct),
  hooprPct: Math.round((100 - num(r.iprsPct) - num(r.ownerPct)) * 100) / 100,
  gross: money(r.gross),
  netOfGst: money(r.netOfGst),
  iprsAmount: money(r.iprsAmount),
  ownerAmount: money(r.ownerAmount),
  hooprAmount: money(r.hooprAmount),
});

const LICENSE_SELECT = `
  "licenseId", "licensedAt", "trackCode", "trackName", "trackSlug",
  "brandId", "brandName", "ownerCode", "ownerName", "ownerType",
  "licenseType", "tokenCost", "dealId", "dealType", "keyName", "isUnlimited",
  attribution, "iprsPct", "ownerPct",
  ${SPLIT_COLS}`;

export const listIprsLicensesService = async (filters: IprsFilters) => {
  const page = filters.page ?? 1;
  const limit = filters.limit ?? 25;
  const b = binds(filters);

  const [rows, countRows, totalRows] = await Promise.all([
    q<LicenseRow>(
      `WITH ${BASE_CTE}
       SELECT ${LICENSE_SELECT}
       FROM base
       WHERE ${FILTER_WHERE}
       ORDER BY ${orderBy(filters.sortBy, filters.sortOrder)}
       LIMIT :limit OFFSET :offset`,
      { ...b, limit, offset: (page - 1) * limit },
    ),
    q<{ count: string }>(
      `WITH ${BASE_CTE}
       SELECT COUNT(*) AS count FROM base WHERE ${FILTER_WHERE}`,
      b,
    ),
    // Totals across the WHOLE filtered set, not just this page — a footer that
    // only sums the visible page is how a partial number gets quoted as final.
    q<Record<string, string>>(
      `WITH ${BASE_CTE}
       SELECT COUNT(*) FILTER (WHERE ${ATTRIBUTABLE}) AS "valuedLicenses", ${SUM_COLS}
       FROM base
       WHERE ${FILTER_WHERE} AND ${ATTRIBUTABLE}`,
      b,
    ),
  ]);

  const t = totalRows[0] ?? {};

  return {
    gstPercent: GST_PCT,
    items: rows.map(mapLicense),
    totals: {
      valuedLicenses: num(t.valuedLicenses),
      gross: money(t.gross),
      netOfGst: money(t.netOfGst),
      iprsAmount: money(t.iprsAmount),
      ownerAmount: money(t.ownerAmount),
      hooprAmount: money(t.hooprAmount),
    },
    pagination: buildPagination(page, limit, num(countRows[0]?.count)),
  };
};

// ─── Grouped views: owners / brands / tracks ─────────────────────────────────

// One shared shape for the three roll-ups — same money columns, different key.
const groupedService =
  (keyCols: string, map: (r: Record<string, string>) => object) =>
  async (filters: IprsFilters) => {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 25;
    const b = binds(filters);

    const [rows, countRows] = await Promise.all([
      q<Record<string, string>>(
        `WITH ${BASE_CTE}
         SELECT ${keyCols},
                COUNT(*) AS licenses,
                COUNT(*) FILTER (WHERE "iprsPct" > 0) AS "iprsLicenses",
                COUNT(DISTINCT "trackCode") AS tracks,
                COALESCE(SUM("tokenCost"), 0) AS "tokensSpent",
                MIN("licensedAt") AS "firstLicensedAt",
                MAX("licensedAt") AS "lastLicensedAt",
                ${SUM_COLS}
         FROM base
         WHERE ${FILTER_WHERE} AND ${ATTRIBUTABLE}
         GROUP BY ${keyCols}
         ORDER BY "iprsAmount" DESC NULLS LAST, licenses DESC
         LIMIT :limit OFFSET :offset`,
        { ...b, limit, offset: (page - 1) * limit },
      ),
      q<{ count: string }>(
        `WITH ${BASE_CTE}
         SELECT COUNT(*) AS count FROM (
           SELECT 1 FROM base
           WHERE ${FILTER_WHERE} AND ${ATTRIBUTABLE}
           GROUP BY ${keyCols}
         ) g`,
        b,
      ),
    ]);

    return {
      gstPercent: GST_PCT,
      items: rows.map(map),
      pagination: buildPagination(page, limit, num(countRows[0]?.count)),
    };
  };

const groupMoney = (r: Record<string, string>) => ({
  licenses: num(r.licenses),
  iprsLicenses: num(r.iprsLicenses),
  tracks: num(r.tracks),
  tokensSpent: num(r.tokensSpent),
  firstLicensedAt: r.firstLicensedAt,
  lastLicensedAt: r.lastLicensedAt,
  gross: money(r.gross),
  netOfGst: money(r.netOfGst),
  iprsAmount: money(r.iprsAmount),
  ownerAmount: money(r.ownerAmount),
  hooprAmount: money(r.hooprAmount),
});

// Who Hoopr owes IPRS money to — the payout list.
export const listIprsOwnersService = groupedService(
  `"ownerCode", "ownerName", "ownerType", "iprsPct", "ownerPct"`,
  (r) => ({
    ownerCode: r.ownerCode,
    ownerName: r.ownerName,
    ownerType: r.ownerType,
    iprsPct: num(r.iprsPct),
    ownerPct: num(r.ownerPct),
    ...groupMoney(r),
  }),
);

// Which client's licensing generated the IPRS liability.
export const listIprsBrandsService = groupedService(
  `"brandId", "brandName"`,
  (r) => ({
    brandId: r.brandId === null ? null : num(r.brandId),
    brandName: r.brandName,
    ...groupMoney(r),
  }),
);

// Track-level detail, for the IPRS work statement.
export const listIprsTracksService = groupedService(
  `"trackCode", "trackName", "ownerCode", "ownerName", "iprsPct"`,
  (r) => ({
    trackCode: r.trackCode,
    trackName: r.trackName,
    ownerCode: r.ownerCode,
    ownerName: r.ownerName,
    iprsPct: num(r.iprsPct),
    ...groupMoney(r),
  }),
);

// ─── Deals (contractual IPRS on the packs themselves) ────────────────────────

export const listIprsDealsService = async (filters: IprsFilters) => {
  const page = filters.page ?? 1;
  const limit = filters.limit ?? 25;

  const where = `
    ta."createdAt" >= ${RANGE_START}
    AND ta."createdAt" < ${RANGE_END}
    AND ((:brandId)::bigint IS NULL OR ta."brandId" = (:brandId)::bigint)
    AND ((:dealType)::text IS NULL OR ta."dealType"::text = (:dealType)::text)
    AND ((:search)::text IS NULL
         OR b.name ILIKE '%' || (:search)::text || '%'
         OR ta."keyName" ILIKE '%' || (:search)::text || '%')`;

  const b = {
    startDate: filters.startDate,
    endDate: filters.endDate,
    brandId: filters.brandId ?? null,
    dealType: filters.dealType ?? null,
    search: filters.search?.trim() ? filters.search.trim() : null,
  };

  // `tokensUsed` counts the licences actually spent against the pack, so a
  // deal's contracted IPRS can be read next to how much of it was consumed.
  const [rows, countRows, totals] = await Promise.all([
    q<Record<string, string>>(
      `SELECT ta.id, ta."brandId", b.name AS "brandName", ta."dealType",
              ta."keyName", ta."isUnlimited", ta."totalAssignedToken",
              ta."tokenBalance", ta."pricePerPack", ta."iprsShare",
              ta."hooprShare", ta."expiryDate", ta."createdAt",
              (SELECT COUNT(*) FROM licenses l WHERE l."tokenId" = ta.id) AS "licensesSpent"
       FROM token_assigned ta
       LEFT JOIN brands b ON b.id = ta."brandId"
       WHERE ${where}
       ORDER BY ta."iprsShare" DESC NULLS LAST, ta.id DESC
       LIMIT :limit OFFSET :offset`,
      { ...b, limit, offset: (page - 1) * limit },
    ),
    q<{ count: string }>(
      `SELECT COUNT(*) AS count
       FROM token_assigned ta LEFT JOIN brands b ON b.id = ta."brandId"
       WHERE ${where}`,
      b,
    ),
    q<Record<string, string>>(
      `SELECT COALESCE(SUM(ta."iprsShare"), 0)  AS "iprsAmount",
              COALESCE(SUM(ta."hooprShare"), 0) AS "hooprAmount",
              COALESCE(SUM(ta."pricePerPack") FILTER (WHERE ta."dealType" = 'bulk'), 0)
                                                AS "packValue"
       FROM token_assigned ta LEFT JOIN brands b ON b.id = ta."brandId"
       WHERE ${where}`,
      b,
    ),
  ]);

  const t = totals[0] ?? {};

  return {
    items: rows.map((r) => {
      const pack = r.pricePerPack === null ? null : money(r.pricePerPack);
      const iprs = r.iprsShare === null ? null : money(r.iprsShare);
      const hoopr = r.hooprShare === null ? null : money(r.hooprShare);
      return {
        dealId: num(r.id),
        brandId: r.brandId === null ? null : num(r.brandId),
        brandName: r.brandName,
        dealType: r.dealType,
        dealKey: r.keyName,
        isUnlimited: Boolean(r.isUnlimited),
        totalAssignedToken: num(r.totalAssignedToken),
        tokenBalance: num(r.tokenBalance),
        licensesSpent: num(r.licensesSpent),
        pricePerPack: pack,
        iprsShare: iprs,
        hooprShare: hoopr,
        expiryDate: r.expiryDate,
        createdAt: r.createdAt,
        // A bulk pack should satisfy iprsShare + hooprShare = pricePerPack.
        // Surface the gap rather than silently balancing it — several prod
        // packs do not add up and finance needs to see which.
        unassigned:
          r.dealType === "bulk" && pack !== null && iprs !== null && hoopr !== null
            ? Math.round((pack - iprs - hoopr) * 100) / 100
            : null,
        balanced:
          r.dealType === "bulk" && pack !== null && iprs !== null && hoopr !== null
            ? Math.abs(pack - iprs - hoopr) < 0.01
            : null,
      };
    }),
    totals: {
      iprsAmount: money(t.iprsAmount),
      hooprAmount: money(t.hooprAmount),
      packValue: money(t.packValue),
      unassigned: money(
        num(t.packValue) - num(t.iprsAmount) - num(t.hooprAmount),
      ),
    },
    pagination: buildPagination(page, limit, num(countRows[0]?.count)),
  };
};

// ─── Filter options ──────────────────────────────────────────────────────────

// Only values that actually appear in the Smash book, so no filter can select
// an empty result set.
export const getIprsFiltersService = async () => {
  const [brands, owners] = await Promise.all([
    q<{ brandId: string; brandName: string; licenses: string }>(
      `SELECT l."brandId" AS "brandId", b.name AS "brandName", COUNT(*) AS licenses
       FROM licenses l
       JOIN users u ON u.id = l."userId" AND u.platform = 'ENTERPRISE'
       LEFT JOIN brands b ON b.id = l."brandId"
       WHERE l."brandId" IS NOT NULL
       GROUP BY 1, 2
       ORDER BY 3 DESC`,
      {},
    ),
    q<{ ownerCode: string; ownerName: string; iprsPct: string; licenses: string }>(
      `SELECT o."ownerCode" AS "ownerCode",
              COALESCE(o.username, o."ownerCode") AS "ownerName",
              COALESCE(o."IPRS", 0) AS "iprsPct",
              COUNT(*) AS licenses
       FROM licenses l
       JOIN users u ON u.id = l."userId" AND u.platform = 'ENTERPRISE'
       JOIN tracks t ON t."trackCode" = l."trackCode"
       JOIN owners o ON o.id = t."ownerId"[1]
       GROUP BY 1, 2, 3
       ORDER BY 4 DESC`,
      {},
    ),
  ]);

  return {
    gstPercent: GST_PCT,
    brands: brands.map((r) => ({
      brandId: num(r.brandId),
      brandName: r.brandName,
      licenses: num(r.licenses),
    })),
    owners: owners.map((r) => ({
      ownerCode: r.ownerCode,
      ownerName: r.ownerName,
      iprsPct: num(r.iprsPct),
      licenses: num(r.licenses),
    })),
    dealTypes: [
      { value: "bulk", label: "Bulk pack" },
      { value: "pricePerTrack", label: "Per-track" },
      { value: "none", label: "No pack (direct)" },
    ],
    attributions: Object.entries(ATTRIBUTION_LABELS).map(([value, label]) => ({
      value,
      label,
      attributable: ATTRIBUTABLE_KEYS.includes(value),
    })),
  };
};

// ─── CSV exports ─────────────────────────────────────────────────────────────

// RFC-4180 quoting: wrap every field and double any embedded quote. Formulae
// are neutralised with a leading apostrophe so a track name starting with `=`
// cannot execute when the export is opened in Excel.
const csvCell = (v: unknown): string => {
  if (v === null || v === undefined) return '""';
  const s = String(v);
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
};

export const toCsv = (
  headers: string[],
  rows: Array<Array<unknown>>,
): string =>
  [headers.map(csvCell).join(","), ...rows.map((r) => r.map(csvCell).join(","))]
    .join("\r\n");

const isoDay = (v: unknown): string =>
  v ? new Date(String(v)).toISOString().slice(0, 10) : "";

// Exports deliberately ignore `page`/`limit` — a paged export is how page 1
// gets forwarded to IPRS as the complete statement. The route strips them.
const EXPORT_LIMIT = 50000;

export const exportIprsLicensesService = async (filters: IprsFilters) => {
  const { items } = await listIprsLicensesService({
    ...filters,
    page: 1,
    limit: EXPORT_LIMIT,
  });

  return toCsv(
    [
      "License ID",
      "Licensed At",
      "Track Code",
      "Track Name",
      "Brand",
      "Owner Code",
      "Owner",
      "Deal Type",
      "Deal Key",
      "Tokens",
      "Valuation Basis",
      "Selling Price",
      `Net of GST (${GST_PCT}%)`,
      "Owner %",
      "Owner Share",
      "IPRS %",
      "IPRS Share",
      "Hoopr %",
      "Hoopr Share",
    ],
    items.map((r) => [
      r.licenseId,
      isoDay(r.licensedAt),
      r.trackCode,
      r.trackName,
      r.brandName,
      r.ownerCode,
      r.ownerName,
      r.dealType ?? "none",
      r.dealKey,
      r.tokenCost,
      r.attributionLabel,
      r.gross,
      r.netOfGst,
      r.ownerPct,
      r.ownerAmount,
      r.iprsPct,
      r.iprsAmount,
      r.hooprPct,
      r.hooprAmount,
    ]),
  );
};

export const exportIprsOwnersService = async (filters: IprsFilters) => {
  const { items } = await listIprsOwnersService({
    ...filters,
    page: 1,
    limit: EXPORT_LIMIT,
  });

  return toCsv(
    [
      "Owner Code",
      "Owner",
      "Owner Type",
      "IPRS %",
      "Owner %",
      "Licenses",
      "IPRS-liable Licenses",
      "Tracks",
      "Tokens",
      "First Licensed",
      "Last Licensed",
      "Selling Price",
      `Net of GST (${GST_PCT}%)`,
      "Owner Share",
      "IPRS Share",
      "Hoopr Share",
    ],
    (items as Array<Record<string, unknown>>).map((r) => [
      r.ownerCode,
      r.ownerName,
      r.ownerType,
      r.iprsPct,
      r.ownerPct,
      r.licenses,
      r.iprsLicenses,
      r.tracks,
      r.tokensSpent,
      isoDay(r.firstLicensedAt),
      isoDay(r.lastLicensedAt),
      r.gross,
      r.netOfGst,
      r.ownerAmount,
      r.iprsAmount,
      r.hooprAmount,
    ]),
  );
};

export const exportIprsBrandsService = async (filters: IprsFilters) => {
  const { items } = await listIprsBrandsService({
    ...filters,
    page: 1,
    limit: EXPORT_LIMIT,
  });

  return toCsv(
    [
      "Brand ID",
      "Brand",
      "Licenses",
      "IPRS-liable Licenses",
      "Tracks",
      "Tokens",
      "First Licensed",
      "Last Licensed",
      "Selling Price",
      `Net of GST (${GST_PCT}%)`,
      "Owner Share",
      "IPRS Share",
      "Hoopr Share",
    ],
    (items as Array<Record<string, unknown>>).map((r) => [
      r.brandId,
      r.brandName,
      r.licenses,
      r.iprsLicenses,
      r.tracks,
      r.tokensSpent,
      isoDay(r.firstLicensedAt),
      isoDay(r.lastLicensedAt),
      r.gross,
      r.netOfGst,
      r.ownerAmount,
      r.iprsAmount,
      r.hooprAmount,
    ]),
  );
};

export const exportIprsTracksService = async (filters: IprsFilters) => {
  const { items } = await listIprsTracksService({
    ...filters,
    page: 1,
    limit: EXPORT_LIMIT,
  });

  return toCsv(
    [
      "Track Code",
      "Track Name",
      "Owner Code",
      "Owner",
      "IPRS %",
      "Licenses",
      "Tokens",
      "First Licensed",
      "Last Licensed",
      "Selling Price",
      `Net of GST (${GST_PCT}%)`,
      "Owner Share",
      "IPRS Share",
      "Hoopr Share",
    ],
    (items as Array<Record<string, unknown>>).map((r) => [
      r.trackCode,
      r.trackName,
      r.ownerCode,
      r.ownerName,
      r.iprsPct,
      r.licenses,
      r.tokensSpent,
      isoDay(r.firstLicensedAt),
      isoDay(r.lastLicensedAt),
      r.gross,
      r.netOfGst,
      r.ownerAmount,
      r.iprsAmount,
      r.hooprAmount,
    ]),
  );
};

export const exportIprsDealsService = async (filters: IprsFilters) => {
  const { items } = await listIprsDealsService({
    ...filters,
    page: 1,
    limit: EXPORT_LIMIT,
  });

  return toCsv(
    [
      "Deal ID",
      "Brand",
      "Deal Type",
      "Deal Key",
      "Unlimited",
      "Tokens Assigned",
      "Tokens Remaining",
      "Licenses Spent",
      "Pack Price",
      "Contracted IPRS",
      "Contracted Hoopr",
      "Unassigned",
      "Balanced",
      "Created",
      "Expires",
    ],
    items.map((r) => [
      r.dealId,
      r.brandName,
      r.dealType,
      r.dealKey,
      r.isUnlimited ? "Yes" : "No",
      r.totalAssignedToken,
      r.tokenBalance,
      r.licensesSpent,
      r.pricePerPack,
      r.iprsShare,
      r.hooprShare,
      r.unassigned,
      r.balanced === null ? "" : r.balanced ? "Yes" : "No",
      isoDay(r.createdAt),
      isoDay(r.expiryDate),
    ]),
  );
};
