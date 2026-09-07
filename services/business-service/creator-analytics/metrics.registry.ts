// ─── The metric catalogue ────────────────────────────────────────────────────
//
// One entry per thing this dashboard can count, and every entry carries BOTH
// halves: how to aggregate it, and how to list the individual rows behind it.
// That pairing is the whole design. A tile the reader cannot open is a number
// they have to take on faith; a drill-down written separately from the tile is
// a drill-down that drifts from it. Here, "Downloads = 18,234" and the 18,234
// rows you get by clicking it are the same `where` string, so they cannot
// disagree.
//
// ── HOW AN ENTRY IS READ ────────────────────────────────────────────────────
//
//   from      the FROM/JOIN chain, aliased `x`, always joined to `creator_users
//             cu` so every metric can be split by derived origin and every
//             drill-down row can name the person.
//   dateCol   the column the window applies to.
//   userCol   the creator this row belongs to, for the unique-people count.
//   amountCol optional money, summed into the tile and the CSV.
//   where     extra predicates that DEFINE the metric (a paid transaction, a
//             non-deleted licence). Never a caller filter — those are bound.
//   columns   the drill-down projection, in display order.
//   sorts     the whitelist a `?sort=` may name. Never interpolation of the
//             request value: this is the one place a query-string value would
//             otherwise reach SQL as structure.
//   tables    every table the entry touches, so an environment missing one
//             reports the metric as unavailable instead of 500ing.
//
// ── WHY THE PROJECTION IS DATA AND NOT A HANDWRITTEN QUERY PER METRIC ───────
//
// There are fourteen of these. Written as fourteen bespoke services they would
// be fourteen places to forget the origin join, the IST boundary, the row cap
// and the CSV escaping. Written as data, the generic reader in detail.service.ts
// gets all four right once. The cost is that a column expression is a string
// rather than typed SQL — which is why nothing in this file is ever built from
// caller input.

import { USER_NAME_SQL, TX_SCOPE, PAYMENT_KIND_EXPR } from "./creator-analytics-shared";

/** A column in a drill-down table. */
export interface MetricColumn {
  /** Response key, and the CSV header slug. */
  key: string;
  /** Column heading. */
  label: string;
  /** SQL expression producing it. Aliased to `key`. */
  sql: string;
  /** How the UI should render it. */
  type?: "text" | "number" | "money" | "datetime" | "user" | "badge" | "link";
}

export interface MetricDef {
  key: string;
  label: string;
  /** Which card group the tile sits in. */
  group: "acquisition" | "engagement" | "money" | "creator";
  /** One line under the tile, and the tooltip on the drill-down. */
  hint: string;
  from: string;
  dateCol: string;
  userCol: string;
  amountCol?: string;
  /** Rupee sign on the tile's secondary figure. */
  amountLabel?: string;
  where?: string;
  columns: MetricColumn[];
  sorts: Record<string, string>;
  defaultSort: string;
  tables: readonly string[];
  /** Optional GROUP BY dimensions this metric can break down by. */
  dimensions?: Record<string, { sql: string; label: string }>;
}

/** Joined onto every metric so a row can name its creator. */
const USER_COLUMNS: MetricColumn[] = [
  { key: "userId", label: "User ID", sql: "cu.id", type: "number" },
  { key: "userName", label: "Name", sql: USER_NAME_SQL, type: "user" },
  { key: "userEmail", label: "Email", sql: "cu.email", type: "text" },
  {
    key: "userMobile",
    label: "Mobile",
    sql: `NULLIF(btrim(COALESCE(cu."countryCode", '') || ' ' || COALESCE(cu.mobile, '')), '')`,
    type: "text",
  },
  { key: "origin", label: "Origin", sql: "cu.origin", type: "badge" },
];

/** The sorts every metric supports, on top of its own. */
const USER_SORTS = {
  userId: "cu.id",
  userName: `lower(COALESCE(cu."firstName", '') || COALESCE(cu."lastName", ''))`,
  origin: "cu.origin",
};

/**
 * Downloads = one `licenses` row.
 *
 * `deleted` is not a column here (the unified `licenses` table uses `status`),
 * and the status vocabulary is mixed on prod — 'active', 'ACTIVE', NULL and
 * 'pending' all appear. Only 'pending' is excluded: it is a licence that was
 * started and not completed, and counting it as a download overstates the one
 * number the content team plans against. Everything else, including the 28k
 * rows with no status at all, is a real export.
 */
const DOWNLOADS: MetricDef = {
  key: "downloads",
  label: "Downloads",
  group: "engagement",
  hint: "Track, stem and SFX exports — one licence row per download.",
  from: `licenses x
         JOIN creator_users cu ON cu.id = x."userId"
         LEFT JOIN tracks t ON t."trackCode" = x."trackCode"`,
  dateCol: `x."licensedAt"`,
  userCol: `x."userId"`,
  where: `lower(COALESCE(x.status, 'active')) <> 'pending'`,
  columns: [
    { key: "downloadedAt", label: "Downloaded", sql: `x."licensedAt"`, type: "datetime" },
    ...USER_COLUMNS,
    { key: "trackCode", label: "Track code", sql: `x."trackCode"`, type: "text" },
    { key: "trackName", label: "Track", sql: `t.name`, type: "text" },
    { key: "assetType", label: "Type", sql: `COALESCE(x.type, 'track')`, type: "badge" },
    { key: "tokenCost", label: "Tokens", sql: `x."tokenCost"`, type: "number" },
    { key: "priceRupees", label: "Price", sql: `x.price`, type: "money" },
    { key: "status", label: "Status", sql: `COALESCE(x.status, '—')`, type: "badge" },
    { key: "campaignId", label: "Campaign", sql: `x."campaignId"`, type: "number" },
  ],
  sorts: {
    ...USER_SORTS,
    downloadedAt: `x."licensedAt"`,
    trackName: `t.name`,
    assetType: `COALESCE(x.type, 'track')`,
  },
  defaultSort: "downloadedAt",
  tables: ["licenses", "tracks"],
  dimensions: {
    assetType: { sql: `COALESCE(x.type, 'track')`, label: "Asset type" },
    track: { sql: `COALESCE(t.name, x."trackCode")`, label: "Track" },
    origin: { sql: `cu.origin`, label: "Origin" },
  },
};

/** Favourites — a liked TRACK. Paired with `playlistLikes` below. */
const LIKES: MetricDef = {
  key: "likes",
  label: "Tracks favourited",
  group: "engagement",
  hint: "Tracks added to favourites.",
  from: `user_liked_tracks x
         JOIN creator_users cu ON cu.id = x."userId"
         LEFT JOIN tracks t ON t."trackCode" = x."trackCode"`,
  dateCol: `x."createdAt"`,
  userCol: `x."userId"`,
  columns: [
    { key: "likedAt", label: "Favourited", sql: `x."createdAt"`, type: "datetime" },
    ...USER_COLUMNS,
    { key: "trackCode", label: "Track code", sql: `x."trackCode"`, type: "text" },
    { key: "trackName", label: "Track", sql: `t.name`, type: "text" },
    { key: "trackType", label: "Type", sql: `t.type`, type: "badge" },
  ],
  sorts: { ...USER_SORTS, likedAt: `x."createdAt"`, trackName: `t.name` },
  defaultSort: "likedAt",
  tables: ["user_liked_tracks", "tracks"],
  dimensions: {
    track: { sql: `COALESCE(t.name, x."trackCode")`, label: "Track" },
    origin: { sql: `cu.origin`, label: "Origin" },
  },
};

/**
 * Favourites — a liked PLAYLIST.
 *
 * snake_case columns, alone in this file: `creator_liked_playlists` was created
 * by a different migration from every other table here. `liked` is a flag the
 * app toggles rather than deleting the row, so an un-liked playlist stays
 * behind as `liked = false` and must be excluded or the count only ever grows.
 */
const PLAYLIST_LIKES: MetricDef = {
  key: "playlistLikes",
  label: "Playlists favourited",
  group: "engagement",
  hint: "Playlists added to favourites. Un-liking clears the flag, not the row.",
  from: `creator_liked_playlists x
         JOIN creator_users cu ON cu.id = x.user_id
         LEFT JOIN playlists p ON p.id = x.playlist_id`,
  dateCol: `x.created_at`,
  userCol: `x.user_id`,
  where: `x.liked IS TRUE`,
  columns: [
    { key: "likedAt", label: "Favourited", sql: `x.created_at`, type: "datetime" },
    ...USER_COLUMNS,
    { key: "playlistName", label: "Playlist", sql: `p.name`, type: "text" },
    { key: "playlistCode", label: "Code", sql: `p."playlistCode"`, type: "text" },
    { key: "playlistType", label: "Type", sql: `p."playlistType"`, type: "badge" },
  ],
  sorts: { ...USER_SORTS, likedAt: `x.created_at`, playlistName: `p.name` },
  defaultSort: "likedAt",
  tables: ["creator_liked_playlists", "playlists"],
  dimensions: {
    playlist: { sql: `COALESCE(p.name, x.playlist_id::text)`, label: "Playlist" },
    origin: { sql: `cu.origin`, label: "Origin" },
  },
};

/** A creator's own collection (their saved-tracks folders). */
const COLLECTIONS: MetricDef = {
  key: "collections",
  label: "Collections created",
  group: "engagement",
  hint: "Folders creators made to organise tracks.",
  from: `collections x JOIN creator_users cu ON cu.id = x."userId"`,
  dateCol: `x."createdAt"`,
  userCol: `x."userId"`,
  where: `COALESCE(x.status, 'ACTIVE') <> 'DELETED'`,
  columns: [
    { key: "createdAt", label: "Created", sql: `x."createdAt"`, type: "datetime" },
    ...USER_COLUMNS,
    { key: "name", label: "Collection", sql: `x.name`, type: "text" },
    {
      key: "itemCount",
      label: "Items",
      // Joined on the VARCHAR business key, not on the bigint primary key:
      // `collection_items.collectionId` holds `collections.collectionId`, and
      // comparing it to `collections.id` is a type error, not a zero.
      sql: `(SELECT count(*) FROM collection_items ci
              WHERE ci."collectionId" = x."collectionId")`,
      type: "number",
    },
    { key: "status", label: "Status", sql: `COALESCE(x.status, 'ACTIVE')`, type: "badge" },
  ],
  sorts: { ...USER_SORTS, createdAt: `x."createdAt"`, name: `lower(x.name)` },
  defaultSort: "createdAt",
  tables: ["collections", "collection_items"],
  dimensions: { origin: { sql: `cu.origin`, label: "Origin" } },
};

/** Tracks saved INTO a collection — the engagement signal, not the folder count. */
const COLLECTION_ITEMS: MetricDef = {
  key: "collectionItems",
  label: "Saved to collections",
  group: "engagement",
  hint: "Individual tracks added to a collection.",
  // Two joins that are easy to get wrong, and both fail as a TYPE ERROR rather
  // than as an empty result — which is the good outcome, but only once:
  //   · `collection_items.collectionId` is the parent's VARCHAR business key,
  //     not its bigint `id`.
  //   · `itemId` is a UUID holding `tracks.id`, not a `trackCode`. A PLAYLIST
  //     row simply finds no track, which is why the join is LEFT.
  from: `collection_items x
         JOIN collections c ON c."collectionId" = x."collectionId"
         JOIN creator_users cu ON cu.id = COALESCE(x."addedByUserId", c."userId")
         LEFT JOIN tracks t ON t.id = x."itemId"`,
  dateCol: `x."createdAt"`,
  userCol: `COALESCE(x."addedByUserId", c."userId")`,
  columns: [
    { key: "savedAt", label: "Saved", sql: `x."createdAt"`, type: "datetime" },
    ...USER_COLUMNS,
    { key: "collectionName", label: "Collection", sql: `c.name`, type: "text" },
    { key: "itemType", label: "Item type", sql: `x."itemType"`, type: "badge" },
    { key: "itemId", label: "Item ID", sql: `x."itemId"`, type: "text" },
    { key: "trackCode", label: "Track code", sql: `t."trackCode"`, type: "text" },
    { key: "trackName", label: "Track", sql: `t.name`, type: "text" },
  ],
  sorts: { ...USER_SORTS, savedAt: `x."createdAt"`, collectionName: `lower(c.name)` },
  defaultSort: "savedAt",
  tables: ["collection_items", "collections", "tracks"],
  dimensions: {
    itemType: { sql: `x."itemType"`, label: "Item type" },
    origin: { sql: `cu.origin`, label: "Origin" },
  },
};

/**
 * Referrals — one row per person who JOINED on someone's code.
 *
 * Counted on `joinedAt`, not `createdAt`: the row is written when the referee's
 * account is created, so the two are usually the same, but `completedAt` is a
 * separate later event (the reward qualifying) and conflating them would report
 * a referral as having happened on the day it paid out.
 */
const REFERRALS: MetricDef = {
  key: "referrals",
  label: "Referrals",
  group: "creator",
  hint: "People who signed up on another creator's referral code.",
  from: `native_referrals x
         JOIN creator_users cu ON cu.id = x."referrerUserId"
         LEFT JOIN users ru ON ru.id = x."refereeUserId"`,
  dateCol: `COALESCE(x."joinedAt", x."createdAt")`,
  userCol: `x."referrerUserId"`,
  columns: [
    {
      key: "joinedAt",
      label: "Joined",
      sql: `COALESCE(x."joinedAt", x."createdAt")`,
      type: "datetime",
    },
    ...USER_COLUMNS,
    { key: "code", label: "Code", sql: `x.code`, type: "text" },
    { key: "source", label: "Source", sql: `x.source`, type: "badge" },
    { key: "status", label: "Status", sql: `x.status`, type: "badge" },
    {
      key: "refereeName",
      label: "Referred person",
      sql: `NULLIF(btrim(COALESCE(ru."firstName", '') || ' ' || COALESCE(ru."lastName", '')), '')`,
      type: "text",
    },
    { key: "refereeEmail", label: "Referred email", sql: `ru.email`, type: "text" },
    { key: "completedAt", label: "Completed", sql: `x."completedAt"`, type: "datetime" },
  ],
  sorts: {
    ...USER_SORTS,
    joinedAt: `COALESCE(x."joinedAt", x."createdAt")`,
    status: `x.status`,
  },
  defaultSort: "joinedAt",
  tables: ["native_referrals", "users"],
  dimensions: {
    status: { sql: `COALESCE(x.status, '(none)')`, label: "Status" },
    source: { sql: `COALESCE(x.source, '(none)')`, label: "Source" },
    origin: { sql: `cu.origin`, label: "Origin" },
  },
};

/** Reel/video claims submitted against a Create & Earn campaign. */
const CLAIMS: MetricDef = {
  key: "claims",
  label: "Reel claims",
  group: "creator",
  hint: "Create & Earn submissions — a posted reel linked to a Hoopr track.",
  from: `video_links x
         JOIN creator_users cu ON cu.id = x."userId"
         LEFT JOIN tracks t ON t."trackCode" = x."trackCode"
         LEFT JOIN campaigns c ON c.id = x."campaignId"`,
  dateCol: `x."createdAt"`,
  userCol: `x."userId"`,
  columns: [
    { key: "submittedAt", label: "Submitted", sql: `x."createdAt"`, type: "datetime" },
    ...USER_COLUMNS,
    { key: "url", label: "Reel", sql: `x.url`, type: "link" },
    { key: "status", label: "Status", sql: `x.status`, type: "badge" },
    { key: "trackName", label: "Track", sql: `t.name`, type: "text" },
    { key: "trackCode", label: "Track code", sql: `x."trackCode"`, type: "text" },
    // The platform lives on the CAMPAIGN, not the claim — video_links has no
    // platform column of its own, and a brand row can carry a null campaign.
    { key: "platform", label: "Platform", sql: `c.platform`, type: "badge" },
    { key: "campaignId", label: "Campaign", sql: `x."campaignId"`, type: "number" },
    { key: "viewCount", label: "Views", sql: `x."viewCount"`, type: "number" },
    // Written by content-recommendation, and 0% populated on brand rows. Shown
    // anyway: blank is the honest answer.
    { key: "reelPostedAt", label: "Posted", sql: `x."reelPostedAt"`, type: "datetime" },
  ],
  sorts: {
    ...USER_SORTS,
    submittedAt: `x."createdAt"`,
    status: `x.status`,
    viewCount: `x."viewCount"`,
  },
  defaultSort: "submittedAt",
  tables: ["video_links", "tracks", "campaigns"],
  dimensions: {
    status: { sql: `COALESCE(x.status, '(none)')`, label: "Status" },
    platform: { sql: `COALESCE(c.platform, '(none)')`, label: "Platform" },
    origin: { sql: `cu.origin`, label: "Origin" },
  },
};

/**
 * Creator payouts.
 *
 * Amount is `amountRupees` on the request; `feeRupees` is what we kept. Counted
 * on `requestedAt` so the tile answers "how much did creators ask for in this
 * window" — the processing date belongs to whoever paid it, and every
 * production payout is manual, so it lags the request by days.
 */
const WITHDRAWALS: MetricDef = {
  key: "withdrawals",
  label: "Withdrawals requested",
  group: "creator",
  hint: "Creator wallet payouts, counted when requested. Every production payout is manual.",
  from: `withdrawals x JOIN creator_users cu ON cu.id = x."userId"`,
  dateCol: `COALESCE(x."requestedAt", x."createdAt")`,
  userCol: `x."userId"`,
  amountCol: `x."amountRupees"`,
  amountLabel: "Requested",
  columns: [
    {
      key: "requestedAt",
      label: "Requested",
      sql: `COALESCE(x."requestedAt", x."createdAt")`,
      type: "datetime",
    },
    ...USER_COLUMNS,
    { key: "amountRupees", label: "Amount", sql: `x."amountRupees"`, type: "money" },
    { key: "status", label: "Status", sql: `x.status`, type: "badge" },
    { key: "mode", label: "Mode", sql: `x.mode`, type: "badge" },
    { key: "utr", label: "UTR", sql: `x.utr`, type: "text" },
    { key: "completedAt", label: "Paid", sql: `x."completedAt"`, type: "datetime" },
    { key: "failureReason", label: "Failure", sql: `x."failureReason"`, type: "text" },
  ],
  sorts: {
    ...USER_SORTS,
    requestedAt: `COALESCE(x."requestedAt", x."createdAt")`,
    amountRupees: `x."amountRupees"`,
    status: `x.status`,
  },
  defaultSort: "requestedAt",
  tables: ["withdrawals"],
  dimensions: {
    status: { sql: `COALESCE(x.status, '(none)')`, label: "Status" },
    mode: { sql: `COALESCE(x.mode, '(none)')`, label: "Mode" },
    origin: { sql: `cu.origin`, label: "Origin" },
  },
};

/** Signups — the second rung of the funnel, listable like any other metric. */
const SIGNUPS: MetricDef = {
  key: "signups",
  label: "Signups",
  group: "acquisition",
  hint: "Accounts created on the Creator platform.",
  from: `creator_users cu`,
  dateCol: `cu."createdAt"`,
  userCol: `cu.id`,
  columns: [
    { key: "signedUpAt", label: "Signed up", sql: `cu."createdAt"`, type: "datetime" },
    ...USER_COLUMNS,
    { key: "city", label: "City", sql: `cu.city`, type: "text" },
    { key: "state", label: "State", sql: `cu.state`, type: "text" },
    { key: "status", label: "Status", sql: `cu.status`, type: "badge" },
  ],
  sorts: { ...USER_SORTS, signedUpAt: `cu."createdAt"`, city: `lower(cu.city)` },
  defaultSort: "signedUpAt",
  tables: ["users"],
  dimensions: {
    origin: { sql: `cu.origin`, label: "Origin" },
    state: { sql: `COALESCE(NULLIF(cu.state, ''), '(unknown)')`, label: "State" },
    city: { sql: `COALESCE(NULLIF(cu.city, ''), '(unknown)')`, label: "City" },
  },
};

/**
 * Subscriptions STARTED in the window — the row, not the payment.
 *
 * Deliberately separate from `payments` below. A comped plan has a
 * subscription row and no money; an Apple renewal has money and no new row.
 * Counting either one as "new subscriptions" gets a different, defensible
 * number, so the dashboard shows both and says which is which.
 */
const SUBSCRIPTIONS: MetricDef = {
  key: "subscriptions",
  label: "Subscriptions started",
  group: "money",
  hint: "Subscription rows created in the window, comped plans included.",
  from: `user_subscriptions x
         JOIN creator_users cu ON cu.id = x."userId"
         LEFT JOIN subscription_plans p ON p.code = x."planCode"`,
  dateCol: `x."createdAt"`,
  userCol: `x."userId"`,
  columns: [
    { key: "startedAt", label: "Started", sql: `x."createdAt"`, type: "datetime" },
    ...USER_COLUMNS,
    { key: "planCode", label: "Plan code", sql: `x."planCode"`, type: "text" },
    {
      key: "planName",
      label: "Plan",
      sql: `COALESCE(p.name, x."legacyPlanName")`,
      type: "text",
    },
    { key: "status", label: "Status", sql: `x.status`, type: "badge" },
    {
      key: "provider",
      label: "Paid via",
      sql: `CASE
              WHEN x."paymentProvider" = 'apple' OR x."appleOriginalTxId" IS NOT NULL THEN 'apple'
              WHEN x."paymentProvider" IN ('manual', 'seeded')                        THEN 'manual'
              WHEN x."paymentProvider" = 'razorpay'
                OR x."razorpaySubscriptionId" IS NOT NULL                             THEN 'razorpay'
              ELSE 'unknown'
            END`,
      type: "badge",
    },
    {
      key: "listPriceRupees",
      label: "List price",
      sql: `COALESCE(p."basePriceRupees", x."legacyPriceExGstRupees")`,
      type: "money",
    },
    { key: "billingCycle", label: "Cycle", sql: `COALESCE(p."billingCycle", x."legacyBillingCycle")`, type: "badge" },
    { key: "periodEnd", label: "Renews / ends", sql: `x."currentPeriodEnd"`, type: "datetime" },
  ],
  sorts: {
    ...USER_SORTS,
    startedAt: `x."createdAt"`,
    planCode: `x."planCode"`,
    status: `x.status`,
  },
  defaultSort: "startedAt",
  tables: ["user_subscriptions", "subscription_plans"],
  dimensions: {
    planCode: { sql: `COALESCE(x."planCode", '(none)')`, label: "Plan" },
    status: { sql: `COALESCE(x.status, '(none)')`, label: "Status" },
    origin: { sql: `cu.origin`, label: "Origin" },
  },
};

/**
 * Subscription payments that arrived — the money rungs of the funnel.
 *
 * TX_SCOPE, not "every transactions row": a licence purchase is not
 * subscription revenue, and an uncaptured payment is not revenue at all.
 * `paymentKind` splits first / renewal / cycle-unknown by the cycle number the
 * webhook stamps — see the note on TX_RENEWAL for why it is never inferred from
 * the payment description.
 */
const PAYMENTS: MetricDef = {
  key: "payments",
  label: "Subscription payments",
  group: "money",
  hint: "Plan-cycle money that actually arrived, split into first payments and renewals.",
  from: `transactions t JOIN creator_users cu ON cu.id = t."userId"`,
  dateCol: `t."createdAt"`,
  userCol: `t."userId"`,
  amountCol: `t."totalAmount"`,
  amountLabel: "Collected",
  where: TX_SCOPE,
  columns: [
    { key: "paidAt", label: "Paid", sql: `t."createdAt"`, type: "datetime" },
    ...USER_COLUMNS,
    { key: "amountRupees", label: "Amount", sql: `t."totalAmount"`, type: "money" },
    { key: "paymentKind", label: "Cycle", sql: PAYMENT_KIND_EXPR, type: "badge" },
    { key: "paymentMethod", label: "Method", sql: `t."paymentMethod"`, type: "badge" },
    { key: "razorpayPaymentId", label: "Payment ID", sql: `t."razorpayPaymentId"`, type: "text" },
    { key: "source", label: "Source", sql: `t.source`, type: "badge" },
    { key: "discountRupees", label: "Discount", sql: `t."totalDiscount"`, type: "money" },
  ],
  sorts: {
    ...USER_SORTS,
    paidAt: `t."createdAt"`,
    amountRupees: `t."totalAmount"`,
    paymentKind: PAYMENT_KIND_EXPR,
  },
  defaultSort: "paidAt",
  tables: ["transactions"],
  dimensions: {
    paymentKind: { sql: PAYMENT_KIND_EXPR, label: "Cycle" },
    paymentMethod: { sql: `COALESCE(t."paymentMethod", '(none)')`, label: "Method" },
    origin: { sql: `cu.origin`, label: "Origin" },
  },
};

/**
 * Identified sessions — a creator actually using the platform.
 *
 * Anonymous sessions have no user to join to, so they are NOT here: the
 * funnel's top rung counts those separately from `native_sessions` direct. This
 * metric is "sessions we can put a name to", which is the one that can be
 * drilled into per person.
 */
const SESSIONS: MetricDef = {
  key: "sessions",
  label: "Signed-in sessions",
  group: "acquisition",
  hint: "Sessions stitched to a known creator. Anonymous visits are counted at the top of the funnel.",
  from: `native_sessions x JOIN creator_users cu ON cu.id = x."userId"`,
  dateCol: `x."startedAt"`,
  userCol: `x."userId"`,
  where: `NOT x."isBot"`,
  columns: [
    { key: "startedAt", label: "Started", sql: `x."startedAt"`, type: "datetime" },
    ...USER_COLUMNS,
    { key: "landingPath", label: "Landing page", sql: `x."landingPath"`, type: "text" },
    { key: "referrerDomain", label: "Referrer", sql: `x."referrerDomain"`, type: "text" },
    { key: "os", label: "OS", sql: `x.os`, type: "badge" },
    { key: "browser", label: "Browser", sql: `x.browser`, type: "badge" },
    { key: "city", label: "City", sql: `x.city`, type: "text" },
    { key: "pageViewCount", label: "Pages", sql: `x."pageViewCount"`, type: "number" },
    { key: "durationSeconds", label: "Duration (s)", sql: `x."durationSeconds"`, type: "number" },
  ],
  sorts: {
    ...USER_SORTS,
    startedAt: `x."startedAt"`,
    durationSeconds: `x."durationSeconds"`,
    pageViewCount: `x."pageViewCount"`,
  },
  defaultSort: "startedAt",
  tables: ["native_sessions"],
  dimensions: {
    os: { sql: `COALESCE(x.os, '(unknown)')`, label: "OS" },
    browser: { sql: `COALESCE(x.browser, '(unknown)')`, label: "Browser" },
    landingPath: { sql: `COALESCE(x."landingPath", '(unknown)')`, label: "Landing page" },
    origin: { sql: `cu.origin`, label: "Origin" },
  },
};

export const METRICS: Record<string, MetricDef> = {
  signups: SIGNUPS,
  sessions: SESSIONS,
  downloads: DOWNLOADS,
  likes: LIKES,
  playlistLikes: PLAYLIST_LIKES,
  collections: COLLECTIONS,
  collectionItems: COLLECTION_ITEMS,
  referrals: REFERRALS,
  claims: CLAIMS,
  withdrawals: WITHDRAWALS,
  subscriptions: SUBSCRIPTIONS,
  payments: PAYMENTS,
};

/** The keys the Joi schema validates `?metric=` against. */
export const METRIC_KEYS = Object.keys(METRICS);

/** Tiles, in the order the dashboard lays them out. */
export const METRIC_ORDER: string[] = [
  "signups",
  "sessions",
  "subscriptions",
  "payments",
  "downloads",
  "likes",
  "playlistLikes",
  "collections",
  "collectionItems",
  "claims",
  "referrals",
  "withdrawals",
];

/** Every table any metric touches, for one probe pass. */
export const ALL_METRIC_TABLES: string[] = [
  ...new Set(Object.values(METRICS).flatMap((m) => m.tables)),
];
