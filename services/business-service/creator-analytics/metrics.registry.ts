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
  group: "acquisition" | "engagement" | "money" | "creator" | "catalogue";
  /** One line under the tile, and the tooltip on the drill-down. */
  hint: string;
  /**
   * Whether the rows belong to a PERSON or to the catalogue.
   *
   * 'user' (the default) joins `creator_users cu`, which is what makes the
   * origin split and the per-person columns possible, and what the free-text
   * search runs against.
   *
   * 'catalogue' rows have no owner — a track is not somebody's — so those
   * metrics skip the join entirely. That is not a detail: joining them to
   * `creator_users` would silently drop every track nobody has touched, which
   * is most of the catalogue. They also ignore the origin filter (there is
   * nothing to derive it from) and bring their own `searchSql`.
   */
  scope?: "user" | "catalogue";
  /**
   * Free-text search for a catalogue metric — a name, a code.
   *
   * Must reference `:search` as a bind, never interpolate. Ignored for
   * user-scoped metrics, which all search the person instead.
   */
  searchSql?: string;
  from: string;
  dateCol: string;
  /** The owning creator. Catalogue metrics leave this as the row's own id. */
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

// ── The catalogue ───────────────────────────────────────────────────────────
//
// These have no owner, so they carry `scope: 'catalogue'` and are NOT joined to
// `creator_users`. Windowing them by `createdAt` answers "what did we ADD in
// this period", which is a real question; the all-time totals live on the
// Overview, which ignores the window entirely.

/**
 * The music catalogue.
 *
 * `type` splits music from SFX and `status` splits live from retired. Both are
 * shown rather than filtered here: "how big is the catalogue" and "how much of
 * it can anyone actually license" are different questions, and a metric that
 * silently answered the second while being labelled the first is exactly the
 * sort of thing that gets quoted wrong.
 */
const TRACKS: MetricDef = {
  key: "tracks",
  label: "Tracks",
  group: "catalogue",
  scope: "catalogue",
  hint: "Everything in the music catalogue — music and SFX, live and retired.",
  // `ownerId` points at `owners` — the LABEL that licensed the track (GSharp
  // Media, Universal Music India, YRF Music), not the artist. It is also a uuid
  // ARRAY, so the join is `= ANY(...)` rather than `=`. Measured on prod:
  // 22,723 tracks carry exactly one owner, 64 carry none, and NONE carries more
  // than one, so this cannot fan a track out into duplicate rows today. If that
  // ever changes the join starts multiplying and the count stops matching the
  // catalogue — `labelName` would be the thing to move into a subquery.
  from: `tracks x LEFT JOIN owners o ON o.id = ANY(x."ownerId")`,
  dateCol: `x."createdAt"`,
  userCol: `x.id`,
  searchSql: `(x.name ILIKE '%' || :search || '%' OR x."trackCode" = :search
               OR x."ISRC" = :search OR o.username ILIKE '%' || :search || '%')`,
  columns: [
    { key: "addedAt", label: "Added", sql: `x."createdAt"`, type: "datetime" },
    { key: "trackCode", label: "Code", sql: `x."trackCode"`, type: "text" },
    { key: "name", label: "Track", sql: `x.name`, type: "user" },
    { key: "type", label: "Type", sql: `x.type`, type: "badge" },
    { key: "status", label: "Status", sql: `x.status`, type: "badge" },
    { key: "tier", label: "Tier", sql: `x.tier`, type: "badge" },
    { key: "labelName", label: "Label", sql: `o.username`, type: "text" },
    // `bpm` is a VARCHAR on this table, so it is displayed as text. Sorting
    // casts it, guarded by a numeric-shape test — an unguarded cast throws on
    // the first non-numeric value someone types in.
    { key: "bpm", label: "BPM", sql: `x.bpm`, type: "text" },
    { key: "durationSeconds", label: "Duration (s)", sql: `x.duration`, type: "number" },
    { key: "hasVocals", label: "Vocals", sql: `x."hasVocals"`, type: "badge" },
    { key: "releaseDate", label: "Released", sql: `x."releaseDate"`, type: "datetime" },
    { key: "isrc", label: "ISRC", sql: `x."ISRC"`, type: "text" },
  ],
  sorts: {
    addedAt: `x."createdAt"`,
    name: `lower(x.name)`,
    type: `x.type`,
    status: `x.status`,
    labelName: `lower(o.username)`,
    bpm: `CASE WHEN x.bpm ~ '^[0-9]+(\\.[0-9]+)?$' THEN x.bpm::numeric END`,
    durationSeconds: `x.duration`,
    releaseDate: `x."releaseDate"`,
  },
  defaultSort: "addedAt",
  tables: ["tracks", "owners"],
  dimensions: {
    type: { sql: `COALESCE(x.type, '(none)')`, label: "Type" },
    status: { sql: `COALESCE(x.status, '(none)')`, label: "Status" },
    // NULLIF before COALESCE: `tier` carries empty strings as well as NULLs on
    // prod, and without it the chart shows a nameless bucket of 2,595 next to
    // a "(none)" bucket that means the same thing.
    tier: { sql: `COALESCE(NULLIF(x.tier, ''), '(none)')`, label: "Tier" },
    label: { sql: `COALESCE(o.username, '(unassigned)')`, label: "Label" },
    vocals: {
      sql: `CASE WHEN x."hasVocals" THEN 'With vocals' ELSE 'Instrumental' END`,
      label: "Vocals",
    },
  },
};

/** Stems — the multitrack layers sold alongside a track. */
const STEMS: MetricDef = {
  key: "stems",
  label: "Stems",
  group: "catalogue",
  scope: "catalogue",
  hint: "Multitrack layers (drums, bass, vocals…) attached to a track.",
  from: `creator_stems x LEFT JOIN tracks t ON t.id = x.track_id`,
  dateCol: `x.created_at`,
  userCol: `x.id`,
  // Soft-deleted stems are excluded: unlike a retired track, a deleted stem is
  // not offered anywhere, so counting it would overstate what is buyable.
  where: `x.deleted IS NULL`,
  searchSql: `(t.name ILIKE '%' || :search || '%' OR x.stem_type ILIKE '%' || :search || '%')`,
  columns: [
    { key: "addedAt", label: "Added", sql: `x.created_at`, type: "datetime" },
    { key: "stemType", label: "Stem", sql: `x.stem_type`, type: "badge" },
    { key: "trackName", label: "Track", sql: `t.name`, type: "user" },
    { key: "trackCode", label: "Track code", sql: `t."trackCode"`, type: "text" },
    { key: "trackType", label: "Track type", sql: `t.type`, type: "badge" },
  ],
  sorts: {
    addedAt: `x.created_at`,
    stemType: `x.stem_type`,
    trackName: `lower(t.name)`,
  },
  defaultSort: "addedAt",
  tables: ["creator_stems", "tracks"],
  dimensions: {
    stemType: { sql: `COALESCE(x.stem_type, '(none)')`, label: "Stem type" },
    trackType: { sql: `COALESCE(t.type, '(none)')`, label: "Track type" },
  },
};

const ARTISTS: MetricDef = {
  key: "artists",
  label: "Artists",
  group: "catalogue",
  scope: "catalogue",
  hint: "Artists in the catalogue, including the ones with a Creator-side page.",
  from: `artists x`,
  dateCol: `x."createdAt"`,
  userCol: `x.id`,
  searchSql: `(x.name ILIKE '%' || :search || '%' OR x."artistCode" = :search)`,
  columns: [
    { key: "addedAt", label: "Added", sql: `x."createdAt"`, type: "datetime" },
    { key: "name", label: "Artist", sql: `x.name`, type: "user" },
    { key: "artistCode", label: "Code", sql: `x."artistCode"`, type: "text" },
    // `artists.type` is a varchar ARRAY (an artist can be singer + composer),
    // so it is flattened for display and for grouping. Left raw it comes back
    // as a JS array the table cannot render, and `COALESCE(type, '(none)')`
    // fails outright with "malformed array literal".
    { key: "type", label: "Type", sql: `array_to_string(x.type, ', ')`, type: "badge" },
    { key: "status", label: "Status", sql: `x.status`, type: "badge" },
    { key: "originRegion", label: "Region", sql: `x."originRegion"`, type: "text" },
    { key: "nativeArtist", label: "Creator page", sql: `x."nativeArtist"`, type: "badge" },
    {
      key: "trackCount",
      label: "Tracks",
      sql: `(SELECT count(*) FROM track_artist_mappings m WHERE m."artistId" = x.id)`,
      type: "number",
    },
  ],
  sorts: {
    addedAt: `x."createdAt"`,
    name: `lower(x.name)`,
    status: `x.status`,
    type: `array_to_string(x.type, ', ')`,
  },
  defaultSort: "addedAt",
  tables: ["artists", "track_artist_mappings"],
  dimensions: {
    status: { sql: `COALESCE(x.status, '(none)')`, label: "Status" },
    type: {
      sql: `COALESCE(NULLIF(array_to_string(x.type, ', '), ''), '(none)')`,
      label: "Type",
    },
    originRegion: { sql: `COALESCE(NULLIF(x."originRegion", ''), '(unknown)')`, label: "Region" },
  },
};

const ALBUMS: MetricDef = {
  key: "albums",
  label: "Albums",
  group: "catalogue",
  scope: "catalogue",
  hint: "Album groupings over the catalogue.",
  // No join to `tracks`: `albums.trackId` is a uuid ARRAY of every track on the
  // album, so an equality join is a type error and an `= ANY` join would fan
  // one album out into a row per track. The count below reads the array
  // directly instead.
  from: `albums x LEFT JOIN artists a ON a.id = x."artistId"`,
  dateCol: `x."createdAt"`,
  userCol: `x.id`,
  where: `x.deleted IS NULL`,
  searchSql: `(x.title ILIKE '%' || :search || '%' OR a.name ILIKE '%' || :search || '%')`,
  columns: [
    { key: "addedAt", label: "Added", sql: `x."createdAt"`, type: "datetime" },
    { key: "title", label: "Album", sql: `x.title`, type: "user" },
    { key: "type", label: "Type", sql: `x.type`, type: "badge" },
    { key: "artistName", label: "Artist", sql: `a.name`, type: "text" },
    {
      key: "trackCount",
      label: "Tracks",
      sql: `COALESCE(array_length(x."trackId", 1), 0)`,
      type: "number",
    },
  ],
  sorts: { addedAt: `x."createdAt"`, title: `lower(x.title)`, type: `x.type` },
  defaultSort: "addedAt",
  tables: ["albums", "artists"],
  dimensions: {
    type: { sql: `COALESCE(x.type, '(none)')`, label: "Type" },
    artist: { sql: `COALESCE(a.name, '(unassigned)')`, label: "Artist" },
  },
};

/**
 * Hoopr's own playlists — the curated/system ones the apps render.
 *
 * Deliberately a different metric from `collections`, which is what a CREATOR
 * makes for themselves. Both get called "playlists" in conversation and they
 * are three orders of magnitude apart in count, so they are never merged here.
 */
const HOOPR_PLAYLISTS: MetricDef = {
  key: "hooprPlaylists",
  label: "Hoopr playlists",
  group: "catalogue",
  scope: "catalogue",
  hint: "Curated and system playlists the apps render. Not creators' own collections.",
  from: `playlists x`,
  dateCol: `x."createdAt"`,
  userCol: `x.id`,
  searchSql: `(x.name ILIKE '%' || :search || '%' OR x."playlistCode" = :search)`,
  columns: [
    { key: "addedAt", label: "Created", sql: `x."createdAt"`, type: "datetime" },
    { key: "name", label: "Playlist", sql: `x.name`, type: "user" },
    { key: "playlistCode", label: "Code", sql: `x."playlistCode"`, type: "text" },
    { key: "type", label: "Type", sql: `x.type`, type: "badge" },
    { key: "playlistType", label: "Kind", sql: `x."playlistType"`, type: "badge" },
    { key: "status", label: "Status", sql: `x.status`, type: "badge" },
    { key: "category", label: "Category", sql: `x.category`, type: "text" },
    {
      key: "trackCount",
      label: "Tracks",
      sql: `(SELECT count(*) FROM track_playlist_mappings m WHERE m."playlistId" = x.id)`,
      type: "number",
    },
  ],
  sorts: {
    addedAt: `x."createdAt"`,
    name: `lower(x.name)`,
    status: `x.status`,
    type: `x.type`,
  },
  defaultSort: "addedAt",
  tables: ["playlists", "track_playlist_mappings"],
  dimensions: {
    status: { sql: `COALESCE(x.status, '(none)')`, label: "Status" },
    type: { sql: `COALESCE(x.type, '(none)')`, label: "Type" },
    playlistType: { sql: `COALESCE(x."playlistType", '(none)')`, label: "Kind" },
  },
};

// ── Two more user-scoped metrics the app writes ─────────────────────────────

/** Video projects — the app's editor sessions, one per video a creator opens. */
const PROJECTS: MetricDef = {
  key: "projects",
  label: "Video projects",
  group: "creator",
  hint: "Editor sessions in the app — one per video a creator brought in to score.",
  from: `sound_projects x JOIN creator_users cu ON cu.id = x."userId"
         LEFT JOIN tracks t ON t."trackCode" = COALESCE(x."committedTrackCode", x."workingTrackCode")`,
  dateCol: `x."createdAt"`,
  userCol: `x."userId"`,
  columns: [
    { key: "createdAt", label: "Created", sql: `x."createdAt"`, type: "datetime" },
    ...USER_COLUMNS,
    { key: "name", label: "Project", sql: `x.name`, type: "text" },
    { key: "status", label: "Status", sql: `x.status`, type: "badge" },
    { key: "platform", label: "Platform", sql: `x.platform`, type: "badge" },
    {
      key: "trackName",
      label: "Track",
      sql: `t.name`,
      type: "text",
    },
    {
      key: "videoDurationSeconds",
      label: "Video (s)",
      sql: `x."videoDuration"`,
      type: "number",
    },
    { key: "lastOpenedAt", label: "Last opened", sql: `x."lastOpenedAt"`, type: "datetime" },
  ],
  sorts: {
    ...USER_SORTS,
    createdAt: `x."createdAt"`,
    lastOpenedAt: `x."lastOpenedAt"`,
    status: `x.status`,
  },
  defaultSort: "createdAt",
  tables: ["sound_projects", "tracks"],
  dimensions: {
    status: { sql: `COALESCE(x.status, '(none)')`, label: "Status" },
    platform: { sql: `COALESCE(x.platform, '(none)')`, label: "Platform" },
    origin: { sql: `cu.origin`, label: "Origin" },
  },
};

/**
 * Shares — a track, playlist or artist sent out of the app.
 *
 * INNER JOIN to `creator_users` like every other user-scoped metric, which
 * means the ~6% of shares made by an anonymous visitor are not counted here.
 * That is the right trade for a per-person dashboard, and the Overview reports
 * the unjoined total beside it so the gap is visible rather than silent.
 */
const SHARES: MetricDef = {
  key: "shares",
  label: "Shares",
  group: "creator",
  hint: "Tracks, playlists and artists shared out of the app by a signed-in creator.",
  from: `native_shares x JOIN creator_users cu ON cu.id = x."userId"`,
  dateCol: `x."createdAt"`,
  userCol: `x."userId"`,
  columns: [
    { key: "sharedAt", label: "Shared", sql: `x."createdAt"`, type: "datetime" },
    ...USER_COLUMNS,
    { key: "entityType", label: "What", sql: `x."entityType"`, type: "badge" },
    { key: "entityTitle", label: "Title", sql: `x."entityTitle"`, type: "text" },
    { key: "channel", label: "Channel", sql: `x.channel`, type: "badge" },
    { key: "clickCount", label: "Clicks", sql: `x."clickCount"`, type: "number" },
    { key: "uniqueClickCount", label: "Unique clicks", sql: `x."uniqueClickCount"`, type: "number" },
    { key: "conversionCount", label: "Conversions", sql: `x."conversionCount"`, type: "number" },
    { key: "lastClickedAt", label: "Last click", sql: `x."lastClickedAt"`, type: "datetime" },
  ],
  sorts: {
    ...USER_SORTS,
    sharedAt: `x."createdAt"`,
    clickCount: `x."clickCount"`,
    conversionCount: `x."conversionCount"`,
  },
  defaultSort: "sharedAt",
  tables: ["native_shares"],
  dimensions: {
    entityType: { sql: `COALESCE(x."entityType", '(none)')`, label: "What" },
    channel: { sql: `COALESCE(x.channel, '(none)')`, label: "Channel" },
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
  projects: PROJECTS,
  shares: SHARES,
  tracks: TRACKS,
  stems: STEMS,
  artists: ARTISTS,
  albums: ALBUMS,
  hooprPlaylists: HOOPR_PLAYLISTS,
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
  "projects",
  "shares",
  "tracks",
  "stems",
  "artists",
  "albums",
  "hooprPlaylists",
];

/** Whether a metric's rows belong to a person. Catalogue rows do not. */
export const isUserScoped = (m: MetricDef): boolean => (m.scope ?? "user") !== "catalogue";

/** Every table any metric touches, for one probe pass. */
export const ALL_METRIC_TABLES: string[] = [
  ...new Set(Object.values(METRICS).flatMap((m) => m.tables)),
];
