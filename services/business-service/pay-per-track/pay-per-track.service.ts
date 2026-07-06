import { QueryTypes } from "sequelize";
import { sequelize } from "../../persistence-service/database";
import { Platform } from "../../dto-service/modules.export";

// ─── Pay-per-track internal analytics ────────────────────────────────────────
//
// Read-only aggregates for the internal-fe "Pay Per Track" dashboard. The
// buyer population is `users.platform = SOUND_TRACKING_APP`; everything here
// is scoped to it. All queries are raw SQL (multi-table aggregations) against
// the shared Postgres — columns are camelCase, so identifiers must be quoted.
//
// Signup origin is derived, not stored:
//   createdBy IS NULL                → 'direct'       (self-signup on platform)
//   creator (users.createdBy row) is
//     platform INTERNAL              → 'internal'     (created by Hoopr staff)
//     anything else                  → 'team_invited' (invited by a team member)
//
// Funnel raw data: `user_activities` only persists high-value actions
// (POST/PUT/DELETE + journey events), so add-to-cart (POST /cart) and
// CHECKOUT_STARTED are queryable; GET views are not. Payment stages come from
// `transactions` (status I/S/F), which is authoritative.
//
// Dates arrive as inclusive IST calendar days (YYYY-MM-DD).
//
// Platform scoping: the checkout routes accept any platform (the current test
// purchases are ENTERPRISE users; the consumer app signs up SOUND_TRACKING_APP
// users), so `platform` is an optional filter on every endpoint. When omitted,
// all customer platforms are included and only INTERNAL (staff CMS accounts)
// is excluded. Implemented as a single reusable predicate around the
// `:platform` replacement (null = no filter).

// IST day boundaries expressed as timestamptz instants, so indexed
// "createdAt" range scans still work.
const RANGE_START = `((:startDate)::timestamp AT TIME ZONE 'Asia/Kolkata')`;
const RANGE_END = `(((:endDate)::date + 1)::timestamp AT TIME ZONE 'Asia/Kolkata')`;
const inRange = (col: string): string =>
  `${col} >= ${RANGE_START} AND ${col} < ${RANGE_END}`;
const istDay = (col: string): string =>
  `to_char(${col} AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD')`;

// Signup-origin classifier; expects `u` = users row and `creator` = LEFT JOIN
// users creator ON creator.id = u."createdBy".
const SOURCE_CASE = `CASE
  WHEN u."createdBy" IS NULL THEN 'direct'
  WHEN creator.platform = '${Platform.INTERNAL}' THEN 'internal'
  ELSE 'team_invited'
END`;

// Add-to-cart activity rows (POST /cart, buy-now included). endpoint stores
// req.originalUrl, so strip any query string before comparing.
const CART_EVENT_WHERE = `ua.method = 'POST' AND split_part(ua.endpoint, '?', 1) = '/cart'`;

interface DateRange {
  startDate: string;
  endDate: string;
  platform?: string;
}

const q = async <T>(sql: string, replacements: object): Promise<T[]> =>
  sequelize.query(sql, {
    replacements: {
      ...replacements,
      platform: (replacements as { platform?: string }).platform ?? null,
    },
    type: QueryTypes.SELECT,
  }) as Promise<T[]>;

const num = (v: unknown): number => (v === null || v === undefined ? 0 : Number(v));

const pct = (part: number, whole: number): number =>
  whole > 0 ? Math.round((part / whole) * 10000) / 100 : 0;

const formatOrderId = (id: number): string =>
  `ORD-${String(id).padStart(8, "0")}`;
const formatTxnId = (id: number): string => `TXN-${String(id).padStart(8, "0")}`;

// "TXN-00000042" / "ORD-42" / "42" → 42, else null. Lets list searches match
// the display ids the dashboard renders.
const parseDisplayId = (search?: string): number | null => {
  if (!search) return null;
  const m = search.trim().match(/^(?:TXN-?|ORD-?)?0*(\d+)$/i);
  return m ? Number(m[1]) : null;
};

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

// ─── Overview ────────────────────────────────────────────────────────────────

export const getOverviewService = async (range: DateRange) => {
  const [signupRows, cartSnapshot, cartEvents, orderRows, txnRows, extras, series] =
    await Promise.all([
      q<{ source: string; count: string }>(
        `SELECT ${SOURCE_CASE} AS source, COUNT(*) AS count
         FROM users u
         LEFT JOIN users creator ON creator.id = u."createdBy"
         WHERE (u.platform = :platform OR ((:platform)::text IS NULL AND u.platform <> 'INTERNAL')) AND ${inRange(`u."createdAt"`)}
         GROUP BY 1`,
        range,
      ),
      q<{ items: string; users: string; value: string }>(
        `SELECT COUNT(*) AS items,
                COUNT(DISTINCT c."userId") AS users,
                COALESCE(SUM(COALESCE(s."sellingPrice", 0) * c.qty), 0) AS value
         FROM carts c
         JOIN users u ON u.id = c."userId" AND (u.platform = :platform OR ((:platform)::text IS NULL AND u.platform <> 'INTERNAL'))
         LEFT JOIN "SKUs" s ON s.id = c."skuId"`,
        {},
      ),
      q<{ events: string; users: string }>(
        `SELECT COUNT(*) AS events, COUNT(DISTINCT ua."userId") AS users
         FROM user_activities ua
         JOIN users u ON u.id = ua."userId" AND (u.platform = :platform OR ((:platform)::text IS NULL AND u.platform <> 'INTERNAL'))
         WHERE ${CART_EVENT_WHERE} AND ${inRange(`ua."createdAt"`)}`,
        range,
      ),
      q<{ status: string; count: string }>(
        `SELECT o.status, COUNT(*) AS count
         FROM orders o
         JOIN users u ON u.id = o."userId" AND (u.platform = :platform OR ((:platform)::text IS NULL AND u.platform <> 'INTERNAL'))
         WHERE ${inRange(`o."createdAt"`)}
         GROUP BY o.status`,
        range,
      ),
      q<{ status: string; count: string; amount: string }>(
        `SELECT t.status, COUNT(*) AS count, COALESCE(SUM(t."payAmount"), 0) AS amount
         FROM transactions t
         JOIN users u ON u.id = t."userId" AND (u.platform = :platform OR ((:platform)::text IS NULL AND u.platform <> 'INTERNAL'))
         WHERE ${inRange(`t."createdAt"`)}
         GROUP BY t.status`,
        range,
      ),
      q<{
        buyers: string;
        repeatBuyers: string;
        unitsSold: string;
      }>(
        `WITH paid AS (
           SELECT t."userId", COUNT(DISTINCT t."orderId") AS orders_count
           FROM transactions t
           JOIN users u ON u.id = t."userId" AND (u.platform = :platform OR ((:platform)::text IS NULL AND u.platform <> 'INTERNAL'))
           WHERE t.status = 'S' AND ${inRange(`t."createdAt"`)}
           GROUP BY t."userId"
         ),
         units AS (
           SELECT COALESCE(SUM(oi.qty), 0) AS units_sold
           FROM order_info oi
           JOIN orders o ON o.id = oi."orderId" AND o.status = 'SUCCESS'
           JOIN users u ON u.id = o."userId" AND (u.platform = :platform OR ((:platform)::text IS NULL AND u.platform <> 'INTERNAL'))
           WHERE ${inRange(`o."createdAt"`)}
         )
         SELECT (SELECT COUNT(*) FROM paid) AS buyers,
                (SELECT COUNT(*) FROM paid WHERE orders_count >= 2) AS "repeatBuyers",
                (SELECT units_sold FROM units) AS "unitsSold"`,
        range,
      ),
      q<{ day: string; signups: string; paidCount: string; revenue: string }>(
        `WITH s AS (
           SELECT ${istDay(`u."createdAt"`)} AS day, COUNT(*) AS signups
           FROM users u
           WHERE (u.platform = :platform OR ((:platform)::text IS NULL AND u.platform <> 'INTERNAL')) AND ${inRange(`u."createdAt"`)}
           GROUP BY 1
         ),
         p AS (
           SELECT ${istDay(`t."createdAt"`)} AS day,
                  COUNT(*) AS paid_count,
                  COALESCE(SUM(t."payAmount"), 0) AS revenue
           FROM transactions t
           JOIN users u ON u.id = t."userId" AND (u.platform = :platform OR ((:platform)::text IS NULL AND u.platform <> 'INTERNAL'))
           WHERE t.status = 'S' AND ${inRange(`t."createdAt"`)}
           GROUP BY 1
         )
         SELECT COALESCE(s.day, p.day) AS day,
                COALESCE(s.signups, 0) AS signups,
                COALESCE(p.paid_count, 0) AS "paidCount",
                COALESCE(p.revenue, 0) AS revenue
         FROM s FULL OUTER JOIN p ON p.day = s.day
         ORDER BY 1`,
        range,
      ),
    ]);

  const signupsBySource: Record<string, number> = {
    direct: 0,
    team_invited: 0,
    internal: 0,
  };
  for (const row of signupRows) signupsBySource[row.source] = num(row.count);
  const totalSignups =
    signupsBySource.direct + signupsBySource.team_invited + signupsBySource.internal;

  const ordersByStatus: Record<string, number> = { PENDING: 0, SUCCESS: 0, FAILED: 0 };
  for (const row of orderRows) ordersByStatus[row.status] = num(row.count);

  const txnByStatus: Record<string, { count: number; amount: number }> = {
    I: { count: 0, amount: 0 },
    S: { count: 0, amount: 0 },
    F: { count: 0, amount: 0 },
  };
  for (const row of txnRows)
    txnByStatus[row.status] = { count: num(row.count), amount: num(row.amount) };

  const revenue = txnByStatus.S.amount;
  const paidCount = txnByStatus.S.count;
  const buyers = num(extras[0]?.buyers);
  const addToCartUsers = num(cartEvents[0]?.users);

  return {
    signups: { total: totalSignups, ...signupsBySource },
    carts: {
      currentItems: num(cartSnapshot[0]?.items),
      currentUsers: num(cartSnapshot[0]?.users),
      currentValue: num(cartSnapshot[0]?.value),
      addToCartEvents: num(cartEvents[0]?.events),
      addToCartUsers,
    },
    orders: {
      total: ordersByStatus.PENDING + ordersByStatus.SUCCESS + ordersByStatus.FAILED,
      ...ordersByStatus,
    },
    transactions: {
      initiated: txnByStatus.I.count,
      success: paidCount,
      failed: txnByStatus.F.count,
    },
    revenue,
    averageOrderValue: paidCount > 0 ? Math.round((revenue / paidCount) * 100) / 100 : 0,
    buyers,
    repeatBuyers: num(extras[0]?.repeatBuyers),
    unitsSold: num(extras[0]?.unitsSold),
    signupToBuyerRate: pct(buyers, totalSignups),
    cartToBuyerRate: pct(buyers, addToCartUsers),
    series: series.map((row) => ({
      day: row.day,
      signups: num(row.signups),
      paidCount: num(row.paidCount),
      revenue: num(row.revenue),
    })),
  };
};

// ─── Signups ─────────────────────────────────────────────────────────────────

export const getSignupsSummaryService = async (range: DateRange) => {
  const rows = await q<{ day: string; source: string; count: string }>(
    `SELECT ${istDay(`u."createdAt"`)} AS day, ${SOURCE_CASE} AS source, COUNT(*) AS count
     FROM users u
     LEFT JOIN users creator ON creator.id = u."createdBy"
     WHERE (u.platform = :platform OR ((:platform)::text IS NULL AND u.platform <> 'INTERNAL')) AND ${inRange(`u."createdAt"`)}
     GROUP BY 1, 2
     ORDER BY 1`,
    range,
  );

  const totals: Record<string, number> = { direct: 0, team_invited: 0, internal: 0 };
  const byDay = new Map<
    string,
    { day: string; direct: number; team_invited: number; internal: number }
  >();
  for (const row of rows) {
    const count = num(row.count);
    totals[row.source] = (totals[row.source] ?? 0) + count;
    const entry =
      byDay.get(row.day) ??
      { day: row.day, direct: 0, team_invited: 0, internal: 0 };
    entry[row.source as "direct" | "team_invited" | "internal"] += count;
    byDay.set(row.day, entry);
  }

  return {
    total: totals.direct + totals.team_invited + totals.internal,
    ...totals,
    series: [...byDay.values()],
  };
};

interface SignupsListParams extends DateRange {
  page: number;
  limit: number;
  source?: string;
  search?: string;
}

export const listSignupsService = async (params: SignupsListParams) => {
  const filters: string[] = [];
  if (params.source) filters.push(`source = :source`);
  if (params.search)
    filters.push(
      `(email ILIKE :search OR "firstName" ILIKE :search OR "lastName" ILIKE :search)`,
    );

  const rows = await q<{
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    status: string;
    emailVerified: boolean;
    mobileVerified: boolean;
    createdAt: Date;
    source: string;
    invitedByEmail: string | null;
    ordersCount: string;
    totalSpend: string;
    totalCount: string;
  }>(
    `WITH signups AS (
       SELECT u.id, u.email, u."firstName", u."lastName", u.status,
              u."emailVerified", u."mobileVerified", u."createdAt",
              ${SOURCE_CASE} AS source,
              creator.email AS "invitedByEmail"
       FROM users u
       LEFT JOIN users creator ON creator.id = u."createdBy"
       WHERE (u.platform = :platform OR ((:platform)::text IS NULL AND u.platform <> 'INTERNAL')) AND ${inRange(`u."createdAt"`)}
     ),
     spend AS (
       SELECT t."userId",
              COUNT(DISTINCT t."orderId") AS orders_count,
              COALESCE(SUM(t."payAmount"), 0) AS total_spend
       FROM transactions t
       WHERE t.status = 'S'
       GROUP BY t."userId"
     )
     SELECT s.*,
            COALESCE(sp.orders_count, 0) AS "ordersCount",
            COALESCE(sp.total_spend, 0) AS "totalSpend",
            COUNT(*) OVER() AS "totalCount"
     FROM signups s
     LEFT JOIN spend sp ON sp."userId" = s.id
     ${filters.length ? `WHERE ${filters.join(" AND ")}` : ""}
     ORDER BY s."createdAt" DESC
     LIMIT :limit OFFSET :offset`,
    {
      ...params,
      search: params.search ? `%${params.search}%` : undefined,
      offset: (params.page - 1) * params.limit,
    },
  );

  const totalItems = num(rows[0]?.totalCount);
  return {
    signups: rows.map((row) => ({
      id: num(row.id),
      email: row.email,
      name: [row.firstName, row.lastName].filter(Boolean).join(" ") || null,
      status: row.status,
      emailVerified: row.emailVerified,
      mobileVerified: row.mobileVerified,
      createdAt: row.createdAt,
      source: row.source,
      invitedByEmail: row.invitedByEmail,
      ordersCount: num(row.ordersCount),
      totalSpend: num(row.totalSpend),
    })),
    pagination: buildPagination(params.page, params.limit, totalItems),
  };
};

// ─── Carts ───────────────────────────────────────────────────────────────────

export const getCartsSummaryService = async (range: DateRange) => {
  const [rows] = await q<{
    currentItems: string;
    currentUsers: string;
    currentValue: string;
    buyNowItems: string;
    regularItems: string;
    abandonedUsers: string;
    addToCartEvents: string;
    addToCartUsers: string;
    convertedUsers: string;
  }>(
    `WITH snapshot AS (
       SELECT c."userId", c."cartType", c.qty,
              COALESCE(s."sellingPrice", 0) * c.qty AS line_value,
              c."createdAt"
       FROM carts c
       JOIN users u ON u.id = c."userId" AND (u.platform = :platform OR ((:platform)::text IS NULL AND u.platform <> 'INTERNAL'))
       LEFT JOIN "SKUs" s ON s.id = c."skuId"
     ),
     -- A cart user is "abandoned" when their newest cart item is >24h old and
     -- they have no successful payment since adding it.
     abandoned AS (
       SELECT x."userId"
       FROM (
         SELECT sn."userId", MAX(sn."createdAt") AS last_added
         FROM snapshot sn
         GROUP BY sn."userId"
       ) x
       WHERE x.last_added < NOW() - INTERVAL '24 hours'
         AND NOT EXISTS (
           SELECT 1 FROM transactions t
           WHERE t."userId" = x."userId" AND t.status = 'S'
             AND t."createdAt" >= x.last_added
         )
     ),
     events AS (
       SELECT COUNT(*) AS events, COUNT(DISTINCT ua."userId") AS users
       FROM user_activities ua
       JOIN users u ON u.id = ua."userId" AND (u.platform = :platform OR ((:platform)::text IS NULL AND u.platform <> 'INTERNAL'))
       WHERE ${CART_EVENT_WHERE} AND ${inRange(`ua."createdAt"`)}
     ),
     converted AS (
       SELECT COUNT(DISTINCT t."userId") AS users
       FROM transactions t
       JOIN users u ON u.id = t."userId" AND (u.platform = :platform OR ((:platform)::text IS NULL AND u.platform <> 'INTERNAL'))
       WHERE t.status = 'S' AND ${inRange(`t."createdAt"`)}
     )
     SELECT
       (SELECT COUNT(*) FROM snapshot) AS "currentItems",
       (SELECT COUNT(DISTINCT "userId") FROM snapshot) AS "currentUsers",
       (SELECT COALESCE(SUM(line_value), 0) FROM snapshot) AS "currentValue",
       (SELECT COUNT(*) FROM snapshot WHERE "cartType" = 'B') AS "buyNowItems",
       (SELECT COUNT(*) FROM snapshot WHERE "cartType" = 'C') AS "regularItems",
       (SELECT COUNT(*) FROM abandoned) AS "abandonedUsers",
       (SELECT events FROM events) AS "addToCartEvents",
       (SELECT users FROM events) AS "addToCartUsers",
       (SELECT users FROM converted) AS "convertedUsers"`,
    range,
  );

  const addToCartUsers = num(rows?.addToCartUsers);
  const convertedUsers = num(rows?.convertedUsers);
  return {
    currentItems: num(rows?.currentItems),
    currentUsers: num(rows?.currentUsers),
    currentValue: num(rows?.currentValue),
    buyNowItems: num(rows?.buyNowItems),
    regularItems: num(rows?.regularItems),
    abandonedUsers: num(rows?.abandonedUsers),
    addToCartEvents: num(rows?.addToCartEvents),
    addToCartUsers,
    cartToPurchaseRate: pct(convertedUsers, addToCartUsers),
  };
};

interface CartsListParams {
  page: number;
  limit: number;
  platform?: string;
  cartType?: string;
  abandoned?: boolean;
  search?: string;
}

export const listCartsService = async (params: CartsListParams) => {
  const filters: string[] = [];
  if (params.cartType) filters.push(`"cartType" = :cartType`);
  if (params.abandoned === true) filters.push(`abandoned = TRUE`);
  if (params.abandoned === false) filters.push(`abandoned = FALSE`);
  if (params.search)
    filters.push(`(email ILIKE :search OR "trackName" ILIKE :search)`);

  const rows = await q<{
    id: string;
    userId: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    source: string;
    skuId: string;
    trackCode: string | null;
    trackName: string | null;
    cartType: string;
    qty: string;
    sellingPrice: string | null;
    addedAt: Date;
    abandoned: boolean;
    totalCount: string;
  }>(
    `WITH cart_rows AS (
       SELECT c.id, c."userId", u.email, u."firstName", u."lastName",
              ${SOURCE_CASE} AS source,
              c."skuId", s."trackCode", tr.name AS "trackName",
              c."cartType", c.qty, s."sellingPrice",
              c."createdAt" AS "addedAt",
              (c."createdAt" < NOW() - INTERVAL '24 hours'
               AND NOT EXISTS (
                 SELECT 1 FROM transactions t
                 WHERE t."userId" = c."userId" AND t.status = 'S'
                   AND t."createdAt" >= c."createdAt"
               )) AS abandoned
       FROM carts c
       JOIN users u ON u.id = c."userId" AND (u.platform = :platform OR ((:platform)::text IS NULL AND u.platform <> 'INTERNAL'))
       LEFT JOIN users creator ON creator.id = u."createdBy"
       LEFT JOIN "SKUs" s ON s.id = c."skuId"
       LEFT JOIN tracks tr ON tr."trackCode" = s."trackCode"
     )
     SELECT *, COUNT(*) OVER() AS "totalCount"
     FROM cart_rows
     ${filters.length ? `WHERE ${filters.join(" AND ")}` : ""}
     ORDER BY "addedAt" DESC
     LIMIT :limit OFFSET :offset`,
    {
      ...params,
      search: params.search ? `%${params.search}%` : undefined,
      offset: (params.page - 1) * params.limit,
    },
  );

  const totalItems = num(rows[0]?.totalCount);
  return {
    items: rows.map((row) => ({
      id: num(row.id),
      userId: num(row.userId),
      email: row.email,
      name: [row.firstName, row.lastName].filter(Boolean).join(" ") || null,
      source: row.source,
      skuId: row.skuId,
      trackCode: row.trackCode,
      trackName: row.trackName,
      cartType: row.cartType,
      qty: num(row.qty),
      sellingPrice: row.sellingPrice === null ? null : num(row.sellingPrice),
      addedAt: row.addedAt,
      abandoned: row.abandoned,
    })),
    pagination: buildPagination(params.page, params.limit, totalItems),
  };
};

// ─── Orders ──────────────────────────────────────────────────────────────────

interface OrdersListParams extends DateRange {
  page: number;
  limit: number;
  status?: string;
  search?: string;
}

export const listOrdersService = async (params: OrdersListParams) => {
  const idSearch = parseDisplayId(params.search);
  const filters: string[] = [];
  if (params.status) filters.push(`o.status = :status`);
  if (params.search) {
    const clauses = [
      `u.email ILIKE :search`,
      `u."firstName" ILIKE :search`,
      `u."lastName" ILIKE :search`,
    ];
    if (idSearch !== null) clauses.push(`o.id = :idSearch`);
    filters.push(`(${clauses.join(" OR ")})`);
  }

  const rows = await q<{
    id: string;
    userId: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    source: string;
    status: string;
    totalAmount: string;
    totalDiscount: string;
    payAmount: string;
    itemCount: string;
    unitCount: string;
    lastTxnStatus: string | null;
    lastTxnMethod: string | null;
    createdAt: Date;
    totalCount: string;
  }>(
    `SELECT o.id, o."userId", u.email, u."firstName", u."lastName",
            ${SOURCE_CASE} AS source,
            o.status, o."totalAmount", o."totalDiscount", o."payAmount",
            o."createdAt",
            (SELECT COUNT(*) FROM order_info oi WHERE oi."orderId" = o.id) AS "itemCount",
            (SELECT COALESCE(SUM(oi.qty), 0) FROM order_info oi WHERE oi."orderId" = o.id) AS "unitCount",
            lt.status AS "lastTxnStatus",
            lt."paymentMethod" AS "lastTxnMethod",
            COUNT(*) OVER() AS "totalCount"
     FROM orders o
     JOIN users u ON u.id = o."userId" AND (u.platform = :platform OR ((:platform)::text IS NULL AND u.platform <> 'INTERNAL'))
     LEFT JOIN users creator ON creator.id = u."createdBy"
     LEFT JOIN LATERAL (
       SELECT t.status, t."paymentMethod"
       FROM transactions t
       WHERE t."orderId" = o.id
       ORDER BY t."createdAt" DESC
       LIMIT 1
     ) lt ON TRUE
     WHERE ${inRange(`o."createdAt"`)}
     ${filters.length ? `AND ${filters.join(" AND ")}` : ""}
     ORDER BY o."createdAt" DESC
     LIMIT :limit OFFSET :offset`,
    {
      ...params,
      search: params.search ? `%${params.search}%` : undefined,
      idSearch,
      offset: (params.page - 1) * params.limit,
    },
  );

  const totalItems = num(rows[0]?.totalCount);
  return {
    orders: rows.map((row) => ({
      id: num(row.id),
      displayId: formatOrderId(num(row.id)),
      userId: num(row.userId),
      email: row.email,
      name: [row.firstName, row.lastName].filter(Boolean).join(" ") || null,
      source: row.source,
      status: row.status,
      totalAmount: num(row.totalAmount),
      totalDiscount: num(row.totalDiscount),
      payAmount: num(row.payAmount),
      itemCount: num(row.itemCount),
      unitCount: num(row.unitCount),
      lastTransactionStatus: row.lastTxnStatus,
      lastTransactionMethod: row.lastTxnMethod,
      createdAt: row.createdAt,
    })),
    pagination: buildPagination(params.page, params.limit, totalItems),
  };
};

export const getOrderDetailService = async (orderId: number) => {
  const [orderRows, itemRows, txnRows] = await Promise.all([
    q<{
      id: string;
      userId: string;
      email: string;
      firstName: string | null;
      lastName: string | null;
      source: string;
      status: string;
      totalAmount: string;
      totalDiscount: string;
      payAmount: string;
      billingAddress: object | null;
      createdAt: Date;
      updatedAt: Date;
    }>(
      `SELECT o.id, o."userId", u.email, u."firstName", u."lastName",
              ${SOURCE_CASE} AS source,
              o.status, o."totalAmount", o."totalDiscount", o."payAmount",
              o."billingAddress", o."createdAt", o."updatedAt"
       FROM orders o
       JOIN users u ON u.id = o."userId"
       LEFT JOIN users creator ON creator.id = u."createdBy"
       WHERE o.id = :orderId`,
      { orderId },
    ),
    q<{
      id: string;
      skuId: string;
      trackCode: string | null;
      trackName: string | null;
      qty: string;
      sellingPrice: string;
      discount: string;
      gstPercent: string;
    }>(
      `SELECT oi.id, oi."skuId", s."trackCode", tr.name AS "trackName",
              oi.qty, oi."sellingPrice", oi.discount, oi."gstPercent"
       FROM order_info oi
       LEFT JOIN "SKUs" s ON s.id = oi."skuId"
       LEFT JOIN tracks tr ON tr."trackCode" = s."trackCode"
       WHERE oi."orderId" = :orderId
       ORDER BY oi.id`,
      { orderId },
    ),
    q<{
      id: string;
      status: string;
      payAmount: string;
      paymentMethod: string | null;
      razorpayOrderId: string | null;
      razorpayPaymentId: string | null;
      createdAt: Date;
    }>(
      `SELECT t.id, t.status, t."payAmount", t."paymentMethod",
              t."razorpayOrderId", t."razorpayPaymentId", t."createdAt"
       FROM transactions t
       WHERE t."orderId" = :orderId
       ORDER BY t."createdAt" DESC`,
      { orderId },
    ),
  ]);

  const order = orderRows[0];
  if (!order) return null;

  return {
    id: num(order.id),
    displayId: formatOrderId(num(order.id)),
    userId: num(order.userId),
    email: order.email,
    name: [order.firstName, order.lastName].filter(Boolean).join(" ") || null,
    source: order.source,
    status: order.status,
    totalAmount: num(order.totalAmount),
    totalDiscount: num(order.totalDiscount),
    payAmount: num(order.payAmount),
    billingAddress: order.billingAddress,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    items: itemRows.map((row) => ({
      id: num(row.id),
      skuId: row.skuId,
      trackCode: row.trackCode,
      trackName: row.trackName,
      qty: num(row.qty),
      sellingPrice: num(row.sellingPrice),
      discount: num(row.discount),
      gstPercent: num(row.gstPercent),
    })),
    transactions: txnRows.map((row) => ({
      id: num(row.id),
      displayId: formatTxnId(num(row.id)),
      status: row.status,
      payAmount: num(row.payAmount),
      paymentMethod: row.paymentMethod,
      razorpayOrderId: row.razorpayOrderId,
      razorpayPaymentId: row.razorpayPaymentId,
      createdAt: row.createdAt,
    })),
  };
};

// ─── Transactions ────────────────────────────────────────────────────────────

export const getTransactionsSummaryService = async (range: DateRange) => {
  const [statusRows, methodRows, series] = await Promise.all([
    q<{ status: string; count: string; amount: string }>(
      `SELECT t.status, COUNT(*) AS count, COALESCE(SUM(t."payAmount"), 0) AS amount
       FROM transactions t
       JOIN users u ON u.id = t."userId" AND (u.platform = :platform OR ((:platform)::text IS NULL AND u.platform <> 'INTERNAL'))
       WHERE ${inRange(`t."createdAt"`)}
       GROUP BY t.status`,
      range,
    ),
    q<{ method: string; count: string; amount: string }>(
      `SELECT COALESCE(t."paymentMethod", 'Unknown') AS method,
              COUNT(*) AS count,
              COALESCE(SUM(t."payAmount"), 0) AS amount
       FROM transactions t
       JOIN users u ON u.id = t."userId" AND (u.platform = :platform OR ((:platform)::text IS NULL AND u.platform <> 'INTERNAL'))
       WHERE t.status = 'S' AND ${inRange(`t."createdAt"`)}
       GROUP BY 1
       ORDER BY 3 DESC`,
      range,
    ),
    q<{
      day: string;
      initiated: string;
      success: string;
      failed: string;
      revenue: string;
    }>(
      `SELECT ${istDay(`t."createdAt"`)} AS day,
              COUNT(*) FILTER (WHERE t.status = 'I') AS initiated,
              COUNT(*) FILTER (WHERE t.status = 'S') AS success,
              COUNT(*) FILTER (WHERE t.status = 'F') AS failed,
              COALESCE(SUM(t."payAmount") FILTER (WHERE t.status = 'S'), 0) AS revenue
       FROM transactions t
       JOIN users u ON u.id = t."userId" AND (u.platform = :platform OR ((:platform)::text IS NULL AND u.platform <> 'INTERNAL'))
       WHERE ${inRange(`t."createdAt"`)}
       GROUP BY 1
       ORDER BY 1`,
      range,
    ),
  ]);

  const byStatus: Record<string, { count: number; amount: number }> = {
    I: { count: 0, amount: 0 },
    S: { count: 0, amount: 0 },
    F: { count: 0, amount: 0 },
  };
  for (const row of statusRows)
    byStatus[row.status] = { count: num(row.count), amount: num(row.amount) };

  const attempts = byStatus.I.count + byStatus.S.count + byStatus.F.count;

  return {
    initiated: byStatus.I.count,
    success: byStatus.S.count,
    failed: byStatus.F.count,
    revenue: byStatus.S.amount,
    successRate: pct(byStatus.S.count, attempts),
    paymentMethods: methodRows.map((row) => ({
      method: row.method,
      count: num(row.count),
      amount: num(row.amount),
    })),
    series: series.map((row) => ({
      day: row.day,
      initiated: num(row.initiated),
      success: num(row.success),
      failed: num(row.failed),
      revenue: num(row.revenue),
    })),
  };
};

interface TransactionsListParams extends DateRange {
  page: number;
  limit: number;
  status?: string;
  paymentMethod?: string;
  search?: string;
}

export const listTransactionsService = async (params: TransactionsListParams) => {
  const idSearch = parseDisplayId(params.search);
  const filters: string[] = [];
  if (params.status) filters.push(`t.status = :status`);
  if (params.paymentMethod) filters.push(`t."paymentMethod" = :paymentMethod`);
  if (params.search) {
    const clauses = [
      `u.email ILIKE :search`,
      `t.email ILIKE :search`,
      `t."razorpayOrderId" ILIKE :search`,
      `t."razorpayPaymentId" ILIKE :search`,
    ];
    if (idSearch !== null) clauses.push(`t.id = :idSearch`, `t."orderId" = :idSearch`);
    filters.push(`(${clauses.join(" OR ")})`);
  }

  const rows = await q<{
    id: string;
    orderId: string;
    userId: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    status: string;
    payAmount: string;
    totalAmount: string;
    totalDiscount: string;
    paymentMethod: string | null;
    razorpayOrderId: string | null;
    razorpayPaymentId: string | null;
    createdAt: Date;
    totalCount: string;
  }>(
    `SELECT t.id, t."orderId", t."userId", u.email, u."firstName", u."lastName",
            t.status, t."payAmount", t."totalAmount", t."totalDiscount",
            t."paymentMethod", t."razorpayOrderId", t."razorpayPaymentId",
            t."createdAt",
            COUNT(*) OVER() AS "totalCount"
     FROM transactions t
     JOIN users u ON u.id = t."userId" AND (u.platform = :platform OR ((:platform)::text IS NULL AND u.platform <> 'INTERNAL'))
     WHERE ${inRange(`t."createdAt"`)}
     ${filters.length ? `AND ${filters.join(" AND ")}` : ""}
     ORDER BY t."createdAt" DESC
     LIMIT :limit OFFSET :offset`,
    {
      ...params,
      search: params.search ? `%${params.search}%` : undefined,
      idSearch,
      offset: (params.page - 1) * params.limit,
    },
  );

  const totalItems = num(rows[0]?.totalCount);
  return {
    transactions: rows.map((row) => ({
      id: num(row.id),
      displayId: formatTxnId(num(row.id)),
      orderId: num(row.orderId),
      orderDisplayId: formatOrderId(num(row.orderId)),
      userId: num(row.userId),
      email: row.email,
      name: [row.firstName, row.lastName].filter(Boolean).join(" ") || null,
      status: row.status,
      payAmount: num(row.payAmount),
      totalAmount: num(row.totalAmount),
      totalDiscount: num(row.totalDiscount),
      paymentMethod: row.paymentMethod,
      razorpayOrderId: row.razorpayOrderId,
      razorpayPaymentId: row.razorpayPaymentId,
      createdAt: row.createdAt,
    })),
    pagination: buildPagination(params.page, params.limit, totalItems),
  };
};

// ─── Funnel ──────────────────────────────────────────────────────────────────

// Stage user-sets, all bounded to the range. The funnel is period-based (any
// activity within the window), so adjacent stages are intersected explicitly
// rather than assumed to be nested.
const FUNNEL_CTES = `
  ppt AS (SELECT id FROM users WHERE (platform = :platform OR ((:platform)::text IS NULL AND platform <> 'INTERNAL'))),
  signup_users AS (
    SELECT u.id AS uid, u."createdAt" AS reached_at
    FROM users u
    WHERE (u.platform = :platform OR ((:platform)::text IS NULL AND u.platform <> 'INTERNAL')) AND ${inRange(`u."createdAt"`)}
  ),
  stream_users AS (
    SELECT sh."userId" AS uid, MAX(sh."createdAt") AS reached_at
    FROM user_stream_history sh
    JOIN ppt ON ppt.id = sh."userId"
    WHERE ${inRange(`sh."createdAt"`)}
    GROUP BY 1
  ),
  cart_users AS (
    SELECT uid, MAX(reached_at) AS reached_at FROM (
      SELECT ua."userId" AS uid, ua."createdAt" AS reached_at
      FROM user_activities ua
      JOIN ppt ON ppt.id = ua."userId"
      WHERE ${CART_EVENT_WHERE} AND ${inRange(`ua."createdAt"`)}
      UNION ALL
      SELECT c."userId", c."createdAt"
      FROM carts c
      JOIN ppt ON ppt.id = c."userId"
      WHERE ${inRange(`c."createdAt"`)}
    ) x GROUP BY uid
  ),
  checkout_users AS (
    SELECT ua."userId" AS uid, MAX(ua."createdAt") AS reached_at
    FROM user_activities ua
    JOIN ppt ON ppt.id = ua."userId"
    WHERE ua.action = 'CHECKOUT_STARTED' AND ${inRange(`ua."createdAt"`)}
    GROUP BY 1
  ),
  payment_users AS (
    SELECT t."userId" AS uid, MAX(t."createdAt") AS reached_at
    FROM transactions t
    JOIN ppt ON ppt.id = t."userId"
    WHERE ${inRange(`t."createdAt"`)}
    GROUP BY 1
  ),
  paid_users AS (
    SELECT t."userId" AS uid, MAX(t."createdAt") AS reached_at
    FROM transactions t
    JOIN ppt ON ppt.id = t."userId"
    WHERE t.status = 'S' AND ${inRange(`t."createdAt"`)}
    GROUP BY 1
  )`;

export const getFunnelService = async (range: DateRange) => {
  const [row] = await q<{
    signups: string;
    streamed: string;
    addedToCart: string;
    checkoutStarted: string;
    paymentInitiated: string;
    purchased: string;
    signupAndStream: string;
    streamAndCart: string;
    cartAndCheckout: string;
    checkoutAndPayment: string;
    paymentAndPaid: string;
  }>(
    `WITH ${FUNNEL_CTES}
     SELECT
       (SELECT COUNT(*) FROM signup_users) AS signups,
       (SELECT COUNT(*) FROM stream_users) AS streamed,
       (SELECT COUNT(*) FROM cart_users) AS "addedToCart",
       (SELECT COUNT(*) FROM checkout_users) AS "checkoutStarted",
       (SELECT COUNT(*) FROM payment_users) AS "paymentInitiated",
       (SELECT COUNT(*) FROM paid_users) AS purchased,
       (SELECT COUNT(*) FROM signup_users s JOIN stream_users st ON st.uid = s.uid) AS "signupAndStream",
       (SELECT COUNT(*) FROM stream_users st JOIN cart_users c ON c.uid = st.uid) AS "streamAndCart",
       (SELECT COUNT(*) FROM cart_users c JOIN checkout_users ch ON ch.uid = c.uid) AS "cartAndCheckout",
       (SELECT COUNT(*) FROM checkout_users ch JOIN payment_users p ON p.uid = ch.uid) AS "checkoutAndPayment",
       (SELECT COUNT(*) FROM payment_users p JOIN paid_users pd ON pd.uid = p.uid) AS "paymentAndPaid"`,
    range,
  );

  const signups = num(row?.signups);
  const streamed = num(row?.streamed);
  const addedToCart = num(row?.addedToCart);
  const checkoutStarted = num(row?.checkoutStarted);
  const paymentInitiated = num(row?.paymentInitiated);
  const purchased = num(row?.purchased);

  // Each boundary reports: of the users in the earlier stage (in this window),
  // how many also appear in the next one, and how many dropped.
  const boundary = (
    stage: string,
    fromCount: number,
    intersection: number,
  ) => ({
    stage,
    converted: intersection,
    dropped: Math.max(fromCount - intersection, 0),
    conversionRate: pct(intersection, fromCount),
  });

  return {
    stages: [
      { key: "signup", label: "Signed up", users: signups },
      { key: "streamed", label: "Streamed a track", users: streamed },
      { key: "cart", label: "Added to cart", users: addedToCart },
      { key: "checkout", label: "Started checkout", users: checkoutStarted },
      { key: "payment", label: "Initiated payment", users: paymentInitiated },
      { key: "paid", label: "Purchased", users: purchased },
    ],
    boundaries: [
      boundary("signup", signups, num(row?.signupAndStream)),
      boundary("streamed", streamed, num(row?.streamAndCart)),
      boundary("cart", addedToCart, num(row?.cartAndCheckout)),
      boundary("checkout", checkoutStarted, num(row?.checkoutAndPayment)),
      boundary("payment", paymentInitiated, num(row?.paymentAndPaid)),
    ],
  };
};

interface FunnelDroppedParams extends DateRange {
  stage: "signup" | "streamed" | "cart" | "checkout" | "payment";
  page: number;
  limit: number;
}

const DROP_STAGE_SQL: Record<FunnelDroppedParams["stage"], { from: string; next: string }> = {
  signup: { from: "signup_users", next: "stream_users" },
  streamed: { from: "stream_users", next: "cart_users" },
  cart: { from: "cart_users", next: "checkout_users" },
  checkout: { from: "checkout_users", next: "payment_users" },
  payment: { from: "payment_users", next: "paid_users" },
};

export const listFunnelDroppedService = async (params: FunnelDroppedParams) => {
  const { from, next } = DROP_STAGE_SQL[params.stage];

  const rows = await q<{
    userId: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    source: string;
    reachedAt: Date;
    cartItems: string;
    cartValue: string;
    lifetimeSpend: string;
    totalCount: string;
  }>(
    `WITH ${FUNNEL_CTES},
     dropped AS (
       SELECT f.uid, f.reached_at
       FROM ${from} f
       WHERE NOT EXISTS (SELECT 1 FROM ${next} n WHERE n.uid = f.uid)
     )
     SELECT d.uid AS "userId", u.email, u."firstName", u."lastName",
            ${SOURCE_CASE} AS source,
            d.reached_at AS "reachedAt",
            (SELECT COUNT(*) FROM carts c WHERE c."userId" = d.uid) AS "cartItems",
            (SELECT COALESCE(SUM(COALESCE(s."sellingPrice", 0) * c.qty), 0)
             FROM carts c LEFT JOIN "SKUs" s ON s.id = c."skuId"
             WHERE c."userId" = d.uid) AS "cartValue",
            (SELECT COALESCE(SUM(t."payAmount"), 0)
             FROM transactions t
             WHERE t."userId" = d.uid AND t.status = 'S') AS "lifetimeSpend",
            COUNT(*) OVER() AS "totalCount"
     FROM dropped d
     JOIN users u ON u.id = d.uid
     LEFT JOIN users creator ON creator.id = u."createdBy"
     ORDER BY d.reached_at DESC
     LIMIT :limit OFFSET :offset`,
    { ...params, offset: (params.page - 1) * params.limit },
  );

  const totalItems = num(rows[0]?.totalCount);
  return {
    stage: params.stage,
    users: rows.map((row) => ({
      userId: num(row.userId),
      email: row.email,
      name: [row.firstName, row.lastName].filter(Boolean).join(" ") || null,
      source: row.source,
      reachedAt: row.reachedAt,
      cartItems: num(row.cartItems),
      cartValue: num(row.cartValue),
      lifetimeSpend: num(row.lifetimeSpend),
    })),
    pagination: buildPagination(params.page, params.limit, totalItems),
  };
};

// ─── Top tracks ──────────────────────────────────────────────────────────────

interface TopTracksParams extends DateRange {
  limit: number;
  by: "revenue" | "units";
}

export const getTopTracksService = async (params: TopTracksParams) => {
  const orderBy = params.by === "units" ? `units DESC, revenue DESC` : `revenue DESC, units DESC`;
  const rows = await q<{
    trackCode: string | null;
    trackName: string | null;
    skuId: string;
    units: string;
    revenue: string;
    buyers: string;
    inCartsNow: string;
    streams: string;
    likes: string;
  }>(
    `SELECT s."trackCode", tr.name AS "trackName", oi."skuId",
            COALESCE(SUM(oi.qty), 0) AS units,
            COALESCE(SUM(oi."sellingPrice" * oi.qty - oi.discount), 0) AS revenue,
            COUNT(DISTINCT o."userId") AS buyers,
            (SELECT COUNT(*) FROM carts c WHERE c."skuId" = oi."skuId") AS "inCartsNow",
            (SELECT COUNT(*) FROM user_stream_history sh
             WHERE sh."trackCode" = s."trackCode" AND ${inRange(`sh."createdAt"`)}) AS streams,
            (SELECT COUNT(*) FROM user_liked_tracks ul
             WHERE ul."trackCode" = s."trackCode" AND ${inRange(`ul."createdAt"`)}) AS likes
     FROM order_info oi
     JOIN orders o ON o.id = oi."orderId" AND o.status = 'SUCCESS'
     JOIN users u ON u.id = o."userId" AND (u.platform = :platform OR ((:platform)::text IS NULL AND u.platform <> 'INTERNAL'))
     LEFT JOIN "SKUs" s ON s.id = oi."skuId"
     LEFT JOIN tracks tr ON tr."trackCode" = s."trackCode"
     WHERE ${inRange(`o."createdAt"`)}
     GROUP BY s."trackCode", tr.name, oi."skuId"
     ORDER BY ${orderBy}
     LIMIT :limit`,
    params,
  );

  return {
    tracks: rows.map((row) => ({
      trackCode: row.trackCode,
      trackName: row.trackName,
      skuId: row.skuId,
      units: num(row.units),
      revenue: num(row.revenue),
      buyers: num(row.buyers),
      inCartsNow: num(row.inCartsNow),
      streams: num(row.streams),
      likes: num(row.likes),
    })),
  };
};

// ─── Customers ───────────────────────────────────────────────────────────────

export const getCustomersSummaryService = async (range: DateRange) => {
  const [row] = await q<{
    buyers: string;
    newBuyers: string;
    repeatBuyers: string;
    revenue: string;
  }>(
    `WITH paid AS (
       SELECT t."userId",
              COUNT(DISTINCT t."orderId") AS orders_count,
              SUM(t."payAmount") AS spend
       FROM transactions t
       JOIN users u ON u.id = t."userId" AND (u.platform = :platform OR ((:platform)::text IS NULL AND u.platform <> 'INTERNAL'))
       WHERE t.status = 'S' AND ${inRange(`t."createdAt"`)}
       GROUP BY t."userId"
     ),
     first_paid AS (
       SELECT t."userId", MIN(t."createdAt") AS first_at
       FROM transactions t
       WHERE t.status = 'S'
       GROUP BY t."userId"
     )
     SELECT
       (SELECT COUNT(*) FROM paid) AS buyers,
       (SELECT COUNT(*) FROM paid p
        JOIN first_paid f ON f."userId" = p."userId"
        WHERE ${inRange(`f.first_at`)}) AS "newBuyers",
       (SELECT COUNT(*) FROM paid WHERE orders_count >= 2) AS "repeatBuyers",
       (SELECT COALESCE(SUM(spend), 0) FROM paid) AS revenue`,
    range,
  );

  const buyers = num(row?.buyers);
  const newBuyers = num(row?.newBuyers);
  const revenue = num(row?.revenue);
  return {
    buyers,
    newBuyers,
    returningBuyers: Math.max(buyers - newBuyers, 0),
    repeatBuyers: num(row?.repeatBuyers),
    revenue,
    averageSpendPerBuyer: buyers > 0 ? Math.round((revenue / buyers) * 100) / 100 : 0,
  };
};

interface CustomersListParams extends DateRange {
  page: number;
  limit: number;
  search?: string;
  sort: "totalSpend" | "ordersCount" | "lastPurchaseAt";
}

const CUSTOMER_SORT_SQL: Record<CustomersListParams["sort"], string> = {
  totalSpend: `"totalSpend" DESC`,
  ordersCount: `"ordersCount" DESC, "totalSpend" DESC`,
  lastPurchaseAt: `"lastPurchaseAt" DESC`,
};

export const listCustomersService = async (params: CustomersListParams) => {
  const rows = await q<{
    userId: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    source: string;
    signedUpAt: Date;
    ordersCount: string;
    unitsBought: string;
    totalSpend: string;
    firstPurchaseAt: Date;
    lastPurchaseAt: Date;
    totalCount: string;
  }>(
    `WITH paid AS (
       SELECT t."userId",
              COUNT(DISTINCT t."orderId") AS orders_count,
              SUM(t."payAmount") AS spend,
              MIN(t."createdAt") AS first_in_range,
              MAX(t."createdAt") AS last_in_range
       FROM transactions t
       JOIN users pu ON pu.id = t."userId" AND (pu.platform = :platform OR ((:platform)::text IS NULL AND pu.platform <> 'INTERNAL'))
       WHERE t.status = 'S' AND ${inRange(`t."createdAt"`)}
       GROUP BY t."userId"
     ),
     units AS (
       SELECT o."userId", SUM(oi.qty) AS units_bought
       FROM orders o
       JOIN order_info oi ON oi."orderId" = o.id
       WHERE o.status = 'SUCCESS' AND ${inRange(`o."createdAt"`)}
       GROUP BY o."userId"
     )
     SELECT p."userId", u.email, u."firstName", u."lastName",
            ${SOURCE_CASE} AS source,
            u."createdAt" AS "signedUpAt",
            p.orders_count AS "ordersCount",
            COALESCE(un.units_bought, 0) AS "unitsBought",
            p.spend AS "totalSpend",
            p.first_in_range AS "firstPurchaseAt",
            p.last_in_range AS "lastPurchaseAt",
            COUNT(*) OVER() AS "totalCount"
     FROM paid p
     JOIN users u ON u.id = p."userId"
     LEFT JOIN users creator ON creator.id = u."createdBy"
     LEFT JOIN units un ON un."userId" = p."userId"
     ${params.search ? `WHERE (u.email ILIKE :search OR u."firstName" ILIKE :search OR u."lastName" ILIKE :search)` : ""}
     ORDER BY ${CUSTOMER_SORT_SQL[params.sort]}
     LIMIT :limit OFFSET :offset`,
    {
      ...params,
      search: params.search ? `%${params.search}%` : undefined,
      offset: (params.page - 1) * params.limit,
    },
  );

  const totalItems = num(rows[0]?.totalCount);
  return {
    customers: rows.map((row) => ({
      userId: num(row.userId),
      email: row.email,
      name: [row.firstName, row.lastName].filter(Boolean).join(" ") || null,
      source: row.source,
      signedUpAt: row.signedUpAt,
      ordersCount: num(row.ordersCount),
      unitsBought: num(row.unitsBought),
      totalSpend: num(row.totalSpend),
      firstPurchaseAt: row.firstPurchaseAt,
      lastPurchaseAt: row.lastPurchaseAt,
    })),
    pagination: buildPagination(params.page, params.limit, totalItems),
  };
};

// ─── Engagement ──────────────────────────────────────────────────────────────
//
// Pre-checkout activity: streams and likes come from their canonical tables
// (user_stream_history / user_liked_tracks — indexed, carry trackCode);
// downloads and video-link submissions only exist as user_activities rows.

const DOWNLOAD_WHERE = `ua.method = 'POST' AND split_part(ua.endpoint, '?', 1) = '/licenses/track-download'`;
const VIDEO_LINK_WHERE = `ua.method = 'POST' AND split_part(ua.endpoint, '?', 1) = '/licenses/video-links'`;

export const getEngagementSummaryService = async (range: DateRange) => {
  const [totalsRows, seriesRows, deviceRows, topEngaged] = await Promise.all([
    q<{
      streams: string;
      listeners: string;
      likes: string;
      likers: string;
      downloads: string;
      videoLinks: string;
    }>(
      `SELECT
         (SELECT COUNT(*) FROM user_stream_history sh
          JOIN users u ON u.id = sh."userId" AND (u.platform = :platform OR ((:platform)::text IS NULL AND u.platform <> 'INTERNAL'))
          WHERE ${inRange(`sh."createdAt"`)}) AS streams,
         (SELECT COUNT(DISTINCT sh."userId") FROM user_stream_history sh
          JOIN users u ON u.id = sh."userId" AND (u.platform = :platform OR ((:platform)::text IS NULL AND u.platform <> 'INTERNAL'))
          WHERE ${inRange(`sh."createdAt"`)}) AS listeners,
         (SELECT COUNT(*) FROM user_liked_tracks ul
          JOIN users u ON u.id = ul."userId" AND (u.platform = :platform OR ((:platform)::text IS NULL AND u.platform <> 'INTERNAL'))
          WHERE ${inRange(`ul."createdAt"`)}) AS likes,
         (SELECT COUNT(DISTINCT ul."userId") FROM user_liked_tracks ul
          JOIN users u ON u.id = ul."userId" AND (u.platform = :platform OR ((:platform)::text IS NULL AND u.platform <> 'INTERNAL'))
          WHERE ${inRange(`ul."createdAt"`)}) AS likers,
         (SELECT COUNT(*) FROM user_activities ua
          JOIN users u ON u.id = ua."userId" AND (u.platform = :platform OR ((:platform)::text IS NULL AND u.platform <> 'INTERNAL'))
          WHERE ${DOWNLOAD_WHERE} AND ${inRange(`ua."createdAt"`)}) AS downloads,
         (SELECT COUNT(*) FROM user_activities ua
          JOIN users u ON u.id = ua."userId" AND (u.platform = :platform OR ((:platform)::text IS NULL AND u.platform <> 'INTERNAL'))
          WHERE ${VIDEO_LINK_WHERE} AND ${inRange(`ua."createdAt"`)}) AS "videoLinks"`,
      range,
    ),
    q<{ day: string; kind: string; count: string }>(
      `SELECT ${istDay(`sh."createdAt"`)} AS day, 'streams' AS kind, COUNT(*) AS count
       FROM user_stream_history sh
       JOIN users u ON u.id = sh."userId" AND (u.platform = :platform OR ((:platform)::text IS NULL AND u.platform <> 'INTERNAL'))
       WHERE ${inRange(`sh."createdAt"`)}
       GROUP BY 1
       UNION ALL
       SELECT ${istDay(`ul."createdAt"`)}, 'likes', COUNT(*)
       FROM user_liked_tracks ul
       JOIN users u ON u.id = ul."userId" AND (u.platform = :platform OR ((:platform)::text IS NULL AND u.platform <> 'INTERNAL'))
       WHERE ${inRange(`ul."createdAt"`)}
       GROUP BY 1
       UNION ALL
       SELECT ${istDay(`ua."createdAt"`)}, 'downloads', COUNT(*)
       FROM user_activities ua
       JOIN users u ON u.id = ua."userId" AND (u.platform = :platform OR ((:platform)::text IS NULL AND u.platform <> 'INTERNAL'))
       WHERE ${DOWNLOAD_WHERE} AND ${inRange(`ua."createdAt"`)}
       GROUP BY 1
       ORDER BY 1`,
      range,
    ),
    q<{ deviceType: string; events: string; users: string }>(
      `SELECT COALESCE(ua."deviceType", 'Unknown') AS "deviceType",
              COUNT(*) AS events,
              COUNT(DISTINCT ua."userId") AS users
       FROM user_activities ua
       JOIN users u ON u.id = ua."userId" AND (u.platform = :platform OR ((:platform)::text IS NULL AND u.platform <> 'INTERNAL'))
       WHERE ${inRange(`ua."createdAt"`)}
       GROUP BY 1
       ORDER BY 2 DESC`,
      range,
    ),
    q<{
      userId: string;
      email: string;
      firstName: string | null;
      lastName: string | null;
      source: string;
      streams: string;
      likes: string;
      lastStreamAt: Date;
      totalSpend: string;
    }>(
      `WITH s AS (
         SELECT sh."userId", COUNT(*) AS streams, MAX(sh."createdAt") AS last_stream
         FROM user_stream_history sh
         JOIN users su ON su.id = sh."userId" AND (su.platform = :platform OR ((:platform)::text IS NULL AND su.platform <> 'INTERNAL'))
         WHERE ${inRange(`sh."createdAt"`)}
         GROUP BY 1
       )
       SELECT s."userId", u.email, u."firstName", u."lastName",
              ${SOURCE_CASE} AS source,
              s.streams,
              (SELECT COUNT(*) FROM user_liked_tracks ul
               WHERE ul."userId" = s."userId" AND ${inRange(`ul."createdAt"`)}) AS likes,
              s.last_stream AS "lastStreamAt",
              (SELECT COALESCE(SUM(t."payAmount"), 0) FROM transactions t
               WHERE t."userId" = s."userId" AND t.status = 'S') AS "totalSpend"
       FROM s
       JOIN users u ON u.id = s."userId"
       LEFT JOIN users creator ON creator.id = u."createdBy"
       ORDER BY s.streams DESC
       LIMIT 10`,
      range,
    ),
  ]);

  const totals = totalsRows[0];
  const byDay = new Map<
    string,
    { day: string; streams: number; likes: number; downloads: number }
  >();
  for (const row of seriesRows) {
    const entry =
      byDay.get(row.day) ?? { day: row.day, streams: 0, likes: 0, downloads: 0 };
    entry[row.kind as "streams" | "likes" | "downloads"] = num(row.count);
    byDay.set(row.day, entry);
  }

  return {
    streams: num(totals?.streams),
    uniqueListeners: num(totals?.listeners),
    likes: num(totals?.likes),
    uniqueLikers: num(totals?.likers),
    downloads: num(totals?.downloads),
    videoLinksSubmitted: num(totals?.videoLinks),
    series: [...byDay.values()].sort((a, b) => a.day.localeCompare(b.day)),
    deviceSplit: deviceRows.map((row) => ({
      deviceType: row.deviceType,
      events: num(row.events),
      users: num(row.users),
    })),
    topEngagedUsers: topEngaged.map((row) => ({
      userId: num(row.userId),
      email: row.email,
      name: [row.firstName, row.lastName].filter(Boolean).join(" ") || null,
      source: row.source,
      streams: num(row.streams),
      likes: num(row.likes),
      lastStreamAt: row.lastStreamAt,
      totalSpend: num(row.totalSpend),
    })),
  };
};

// ─── User detail & activity timeline ─────────────────────────────────────────

export const getUserDetailService = async (userId: number) => {
  const [rows] = await q<{
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    platform: string;
    status: string;
    emailVerified: boolean | null;
    mobileVerified: boolean | null;
    createdAt: Date;
    source: string;
    invitedByEmail: string | null;
    cartItems: string;
    cartValue: string;
    streams: string;
    likes: string;
    ordersCount: string;
    totalSpend: string;
    lastPurchaseAt: Date | null;
    lastActivityAt: Date | null;
  }>(
    `SELECT u.id, u.email, u."firstName", u."lastName", u.platform, u.status,
            u."emailVerified", u."mobileVerified", u."createdAt",
            ${SOURCE_CASE} AS source,
            creator.email AS "invitedByEmail",
            (SELECT COUNT(*) FROM carts c WHERE c."userId" = u.id) AS "cartItems",
            (SELECT COALESCE(SUM(COALESCE(s."sellingPrice", 0) * c.qty), 0)
             FROM carts c LEFT JOIN "SKUs" s ON s.id = c."skuId"
             WHERE c."userId" = u.id) AS "cartValue",
            (SELECT COUNT(*) FROM user_stream_history sh WHERE sh."userId" = u.id) AS streams,
            (SELECT COUNT(*) FROM user_liked_tracks ul WHERE ul."userId" = u.id) AS likes,
            (SELECT COUNT(DISTINCT t."orderId") FROM transactions t
             WHERE t."userId" = u.id AND t.status = 'S') AS "ordersCount",
            (SELECT COALESCE(SUM(t."payAmount"), 0) FROM transactions t
             WHERE t."userId" = u.id AND t.status = 'S') AS "totalSpend",
            (SELECT MAX(t."createdAt") FROM transactions t
             WHERE t."userId" = u.id AND t.status = 'S') AS "lastPurchaseAt",
            (SELECT MAX(ua."createdAt") FROM user_activities ua
             WHERE ua."userId" = u.id) AS "lastActivityAt"
     FROM users u
     LEFT JOIN users creator ON creator.id = u."createdBy"
     WHERE u.id = :userId`,
    { userId },
  );

  if (!rows) return null;
  return {
    id: num(rows.id),
    email: rows.email,
    name: [rows.firstName, rows.lastName].filter(Boolean).join(" ") || null,
    platform: rows.platform,
    status: rows.status,
    emailVerified: rows.emailVerified,
    mobileVerified: rows.mobileVerified,
    createdAt: rows.createdAt,
    source: rows.source,
    invitedByEmail: rows.invitedByEmail,
    cartItems: num(rows.cartItems),
    cartValue: num(rows.cartValue),
    streams: num(rows.streams),
    likes: num(rows.likes),
    ordersCount: num(rows.ordersCount),
    totalSpend: num(rows.totalSpend),
    lastPurchaseAt: rows.lastPurchaseAt,
    lastActivityAt: rows.lastActivityAt,
  };
};

// Human label for a raw activity row; anything unrecognised falls back to
// "<ACTION> <path>" so new event types surface without a code change.
const activityLabel = (
  action: string,
  method: string,
  endpoint: string,
): string => {
  const path = endpoint.split("?")[0];
  switch (action) {
    case "CHECKOUT_STARTED":
      return "Started checkout";
    case "BILLING_ADDRESS_PREFILLED":
      return "Checkout: billing address prefilled";
    case "BILLING_ADDRESS_FORM_OPENED":
      return "Checkout: opened billing form";
    case "BILLING_ADDRESS_CONTINUED":
      return "Checkout: continued with saved address";
    case "LOGIN":
      return "Logged in";
    case "LOGOUT":
      return "Logged out";
  }
  if (path === "/stream-history") return "Streamed a track";
  if (path === "/liked-tracks")
    return method === "DELETE" ? "Unliked a track" : "Liked a track";
  if (path === "/cart") return method === "POST" ? "Added to cart" : "Updated cart";
  if (path === "/transaction/init") return "Initiated payment";
  if (path === "/transaction/commit") return "Payment confirmed by gateway";
  if (path === "/licenses/track-download") return "Downloaded a track";
  if (path.startsWith("/licenses/video-links")) return "Submitted video link";
  if (path.startsWith("/licenses/track/")) return "Licensed a track";
  if (path === "/user/address") return "Saved billing address";
  return `${action} ${path}`;
};

interface UserActivityParams {
  userId: number;
  page: number;
  limit: number;
}

export const listUserActivityService = async (params: UserActivityParams) => {
  const rows = await q<{
    id: string;
    action: string;
    endpoint: string;
    method: string;
    statusCode: number | null;
    deviceType: string | null;
    browser: string | null;
    os: string | null;
    trackCode: string | null;
    createdAt: Date;
    totalCount: string;
  }>(
    `SELECT ua.id, ua.action, ua.endpoint, ua.method, ua."statusCode",
            ua."deviceType", ua.browser, ua.os,
            ua."requestBody"->>'trackCode' AS "trackCode",
            ua."createdAt",
            COUNT(*) OVER() AS "totalCount"
     FROM user_activities ua
     WHERE ua."userId" = :userId
     ORDER BY ua."createdAt" DESC
     LIMIT :limit OFFSET :offset`,
    { ...params, offset: (params.page - 1) * params.limit },
  );

  const totalItems = num(rows[0]?.totalCount);
  return {
    events: rows.map((row) => ({
      id: num(row.id),
      label: activityLabel(row.action, row.method, row.endpoint),
      action: row.action,
      endpoint: row.endpoint.split("?")[0],
      method: row.method,
      statusCode: row.statusCode,
      deviceType: row.deviceType,
      browser: row.browser,
      os: row.os,
      trackCode: row.trackCode,
      createdAt: row.createdAt,
    })),
    pagination: buildPagination(params.page, params.limit, totalItems),
  };
};
