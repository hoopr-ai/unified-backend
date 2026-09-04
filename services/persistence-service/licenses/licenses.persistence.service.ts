import { Op, QueryTypes } from "sequelize";
import { sequelize } from "../database";
import { LicenseModel, type LicenseDetails, VideoLinkModel } from "./schemas/modules.export";
import { TrackModel } from "../track/schemas/modules.export";
import { UserModel } from "../user/schemas/modules.export";
import { TrackArtistMappingModel, ArtistModel } from "../artists/modules.export";

export const createLicenseRecord = async (
  licenseDetails: LicenseDetails
): Promise<LicenseDetails> => {
  const license = await LicenseModel.create(licenseDetails);
  return license;
};

// Separates the downloads list by content: 'sfx' → only SFX tracks, 'tracks' → everything else
export type LicenseHistoryCategory = "tracks" | "sfx";

export const getLicensesByBrandId = async (
  brandId: number,
  page: number = 1,
  limit: number = 50,
  category?: LicenseHistoryCategory,
): Promise<{ rows: LicenseModel[]; count: number }> => {
  const offset = (page - 1) * limit;

  // Filter on the joined track's type so old licenses of SFX tracks (created
  // before SFX became free) still land in the SFX bucket.
  let trackWhere: Record<string | symbol, unknown> | undefined;
  if (category === "sfx") {
    trackWhere = { type: { [Op.iLike]: "sfx" } };
  } else if (category === "tracks") {
    trackWhere = {
      [Op.or]: [{ type: { [Op.notILike]: "sfx" } }, { type: null }],
    };
  }

  const { rows, count } = await LicenseModel.findAndCountAll({
    where: { brandId },
    include: [
      {
        model: TrackModel,
        attributes: ["id", "trackCode", "name", "sourceLink", "ownerId", "type"],
        ...(trackWhere && { where: trackWhere, required: true }),
        include: [
          {
            model: TrackArtistMappingModel,
            as: "trackArtistMappings",
            required: false,
            where: { isPrimary: true },
            attributes: ["artistId", "isPrimary"],
            include: [
              {
                model: ArtistModel,
                as: "artist",
                attributes: ["id", "name"],
              },
            ],
          },
        ],
      },
      {
        model: UserModel,
        attributes: ["id", "email", "firstName", "lastName"],
      },
      {
        model: VideoLinkModel,
        attributes: ["id", "url", "status", "trackCode", "createdAt", "reelPostedAt"],
      },
    ],
    order: [["licensedAt", "DESC"]],
    limit,
    offset,
    distinct: true,
  });
  return { rows, count };
};


// ── Downloads list: status counts, filtering and sorting ──────────────────
//
// The Downloads table buckets every licence by how close it is to lapsing, and
// needs three things a paginated include-query cannot give: chip counts across
// the WHOLE brand, filtering by a bucket, and ordering by an expiry that is not
// stored anywhere.
//
// All three depend on values DERIVED per licence — the earliest publish date
// across its video links, and how many links it has — so none of them can be
// done in JavaScript after the page is fetched. Counting ten rows cannot tell
// you about the other two thousand, and sorting a page only reorders the rows
// that were already (wrongly) chosen. So this runs in SQL and returns just the
// ids for the page, which the caller then hydrates through the normal model
// includes. Two round trips, but the second one is a plain id lookup.
//
// The CASE below is the same rule as expiryStatusOf in
// business-service/licenses/publishedTerm.ts. Keeping the two in step is a
// standing obligation — see the note there.

export const LICENSE_SORTS = [
  "expiring-first",
  "recently-downloaded",
  "recently-published",
] as const;
export type LicenseSort = (typeof LICENSE_SORTS)[number];

export const isLicenseSort = (v: unknown): v is LicenseSort =>
  typeof v === "string" && (LICENSE_SORTS as readonly string[]).includes(v);

export interface DownloadsStatusCounts {
  /** Every licence in the list for this category — INCLUDING SFX, so it always
   *  matches what the user can actually see. Equals the five buckets plus
   *  notApplicable. */
  all: number;
  expired: number;
  notPublished: number;
  linkNotAdded: number;
  expiringSoon: number;
  active: number;
  /** SFX: free, no usage-link obligation, so no bucket applies. Counted here
   *  so `all` still reconciles against the sum of the buckets. */
  notApplicable: number;
}

export interface DownloadsPage {
  /** License ids for the requested page, already in the requested order. */
  ids: number[];
  /** Size of the FILTERED set — what the pager counts. */
  totalItems: number;
  /** Whole brand + category, IGNORING the status filter — what the chips count. */
  counts: DownloadsStatusCounts;
  /** Per-licence derived values, keyed by license id, for the rows on this page. */
  derived: Map<number, { publishedAt: Date | null; linkCount: number; status: string; isSfx: boolean }>;
}

/**
 * `scored`: one row per licence with its bucket already decided.
 *
 * The category predicate mirrors getLicensesByBrandId exactly, including the
 * join strength: when a category is asked for, the track join is INNER (a
 * licence whose track row has gone missing drops out, as it does there); with
 * no category the join is LEFT, so those licences still appear.
 *
 * The video-link join is always LEFT — a licence with no links at all is the
 * common case here, and it is precisely the one the screen exists to show.
 */
const SCORED_CTE = (category?: LicenseHistoryCategory) => {
  const join = category ? "JOIN" : "LEFT JOIN";
  const predicate =
    category === "sfx"
      ? `AND t.type ILIKE 'sfx'`
      : category === "tracks"
        ? `AND (t.type NOT ILIKE 'sfx' OR t.type IS NULL)`
        : "";
  return `
    WITH agg AS (
      SELECT li.id,
             li."licensedAt"                AS licensed_at,
             COUNT(v.id)::int               AS link_count,
             MIN(v."reelPostedAt")          AS published_at,
             -- BOOL_OR, not a bare comparison: the track join is on trackCode,
             -- and COALESCE keeps a licence whose track row is missing (LEFT
             -- JOIN, no category) as non-SFX rather than NULL.
             COALESCE(BOOL_OR(COALESCE(t.type, '') ILIKE 'sfx'), FALSE) AS is_sfx
        FROM licenses li
        ${join} tracks t ON t."trackCode" = li."trackCode"
        LEFT JOIN video_links v ON v."licenseId" = li.id
       WHERE li."brandId" = :brandId
         ${predicate}
       GROUP BY li.id, li."licensedAt"
    ),
    scored AS (
      SELECT id, licensed_at, link_count, published_at, is_sfx,
             published_at + (:termYears * INTERVAL '1 year') AS expires_at,
             CASE
               -- SFX first, ahead of every other rule: they are free and carry
               -- no link obligation, so no bucket describes them.
               WHEN is_sfx THEN 'not-applicable'
               WHEN published_at IS NOT NULL
                    AND published_at + (:termYears * INTERVAL '1 year') < NOW()
                 THEN 'expired'
               WHEN published_at IS NULL                    THEN 'not-published'
               WHEN link_count < :requiredLinks             THEN 'link-not-added'
               WHEN published_at + (:termYears * INTERVAL '1 year')
                    < NOW() + (:soonDays * INTERVAL '1 day') THEN 'expiring-soon'
               ELSE 'active'
             END AS status
        FROM agg
    )`;
};

/**
 * ORDER BY for each sort the API offers.
 *
 * NULLS LAST on both date sorts is the point of them: an unpublished licence
 * has no expiry and no publish date, and floating those to the top of a list
 * whose whole purpose is "what lapses next" would bury the rows that matter.
 * `id` is appended everywhere as a tiebreak so paging is stable — without it
 * two licences sharing a timestamp can swap places between page 1 and page 2
 * and a row is shown twice or not at all.
 */
const ORDER_BY: Record<LicenseSort, string> = {
  "expiring-first": `expires_at ASC NULLS LAST, licensed_at DESC, id DESC`,
  "recently-downloaded": `licensed_at DESC, id DESC`,
  "recently-published": `published_at DESC NULLS LAST, licensed_at DESC, id DESC`,
};

export const getBrandDownloadsPage = async (
  brandId: number,
  opts: {
    page: number;
    limit: number;
    category?: LicenseHistoryCategory;
    status?: string;
    sort: LicenseSort;
    termYears: number;
    requiredLinks: number;
    soonDays: number;
  },
): Promise<DownloadsPage> => {
  const { page, limit, category, status, sort, termYears, requiredLinks, soonDays } = opts;
  const replacements = { brandId, termYears, requiredLinks, soonDays };
  const cte = SCORED_CTE(category);

  // Chip counts. Deliberately NOT filtered by `status` — the chips have to keep
  // showing every bucket's size while one of them is selected, otherwise
  // choosing "Expired" collapses the row of chips to a single number and the
  // user loses the way back.
  const countRows = await sequelize.query<{ status: string; n: string }>(
    `${cte} SELECT status, COUNT(*)::int AS n FROM scored GROUP BY status`,
    { replacements, type: QueryTypes.SELECT },
  );

  const counts: DownloadsStatusCounts = {
    all: 0, expired: 0, notPublished: 0, linkNotAdded: 0,
    expiringSoon: 0, active: 0, notApplicable: 0,
  };
  const KEY: Record<string, keyof DownloadsStatusCounts> = {
    expired: "expired",
    "not-published": "notPublished",
    "link-not-added": "linkNotAdded",
    "expiring-soon": "expiringSoon",
    active: "active",
    "not-applicable": "notApplicable",
  };
  for (const row of countRows) {
    const n = Number(row.n);
    const key = KEY[row.status];
    if (key) counts[key] = n;
    counts.all += n;
  }

  // totalItems describes the FILTERED set, because it is what drives the pager.
  const totalItems = status ? (counts[KEY[status]] ?? 0) : counts.all;
  if (totalItems === 0) {
    return { ids: [], totalItems, counts, derived: new Map() };
  }

  const pageRows = await sequelize.query<{
    id: string; published_at: Date | null; link_count: number; status: string; is_sfx: boolean;
  }>(
    `${cte}
     SELECT id, published_at, link_count, status, is_sfx
       FROM scored
      ${status ? "WHERE status = :status" : ""}
      ORDER BY ${ORDER_BY[sort]}
      LIMIT :limit OFFSET :offset`,
    {
      replacements: {
        ...replacements,
        ...(status ? { status } : {}),
        limit,
        offset: (page - 1) * limit,
      },
      type: QueryTypes.SELECT,
    },
  );

  const derived = new Map<number, { publishedAt: Date | null; linkCount: number; status: string; isSfx: boolean }>();
  const ids: number[] = [];
  for (const r of pageRows) {
    const id = Number(r.id);
    ids.push(id);
    derived.set(id, {
      publishedAt: r.published_at ? new Date(r.published_at) : null,
      linkCount: Number(r.link_count),
      status: r.status,
      isSfx: Boolean(r.is_sfx),
    });
  }
  return { ids, totalItems, counts, derived };
};

/**
 * Hydrate an explicit, already-ordered set of license ids.
 *
 * Same includes as getLicensesByBrandId so the response shape is unchanged.
 * Sequelize will not preserve an IN-list's order, so the rows are re-sorted
 * into `ids` order here — losing that would silently undo the sort the caller
 * just paid a query to compute.
 */
export const getLicensesByIds = async (ids: number[]): Promise<LicenseModel[]> => {
  if (ids.length === 0) return [];
  const rows = await LicenseModel.findAll({
    where: { id: { [Op.in]: ids } },
    include: [
      {
        model: TrackModel,
        attributes: ["id", "trackCode", "name", "sourceLink", "ownerId", "type"],
        include: [
          {
            model: TrackArtistMappingModel,
            as: "trackArtistMappings",
            required: false,
            where: { isPrimary: true },
            attributes: ["artistId", "isPrimary"],
            include: [{ model: ArtistModel, as: "artist", attributes: ["id", "name"] }],
          },
        ],
      },
      { model: UserModel, attributes: ["id", "email", "firstName", "lastName"] },
      {
        model: VideoLinkModel,
        attributes: ["id", "url", "status", "trackCode", "createdAt", "reelPostedAt"],
      },
    ],
  });
  const byId = new Map(rows.map((r) => [Number(r.id), r]));
  return ids.map((id) => byId.get(id)).filter((r): r is LicenseModel => Boolean(r));
};

export const getTotalLicensesByBrandId = async (
  brandId: number
): Promise<number> => {
  const count = await LicenseModel.count({
    where: { brandId },
  });
  return count;
};

export const getTotalLicensesByUserId = async (
  userId: number
): Promise<number> => {
  const count = await LicenseModel.count({
    where: { userId },
  });
  return count;
};

export const countLicensesWithMissingVideoLinks = async (
  brandId: number,
  requiredVideoLinksCount: number = 3
): Promise<number> => {
  const licenses = await LicenseModel.findAll({
    where: { brandId },
    include: [
      {
        model: VideoLinkModel,
        attributes: ["id"],
      },
      {
        model: TrackModel,
        attributes: ["type"],
        required: false,
      },
    ],
  });

  let missingCount = 0;
  for (const license of licenses) {
    // Free SFX downloads don't require video links
    if ((license.track?.type ?? "").toLowerCase() === "sfx") {
      continue;
    }
    const videoLinksCount = license.videoLinks?.length ?? 0;
    if (videoLinksCount < requiredVideoLinksCount) {
      missingCount++;
    }
  }

  return missingCount;
};

export const findLicensesByUserIdAndTrackCodes = async (
  userId: number,
  trackCodes: string[],
): Promise<{ trackCode: string; id: number }[]> => {
  const licenses = await LicenseModel.findAll({
    where: {
      userId,
      trackCode: { [Op.in]: trackCodes },
      type: "pay_per_track",
    },
    attributes: ["id", "trackCode"],
    order: [["createdAt", "DESC"]],
  });
  return licenses.map((l) => ({ id: l.id, trackCode: l.trackCode }));
};
