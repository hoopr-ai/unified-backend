/**
 * Usage term attached to a published video.
 *
 * A brand's licence runs for one year from the day the video actually went
 * live, not from the day the track was downloaded — so the expiry is derived
 * from `video_links."reelPostedAt"` rather than from anything on the licence.
 *
 * The expiry is computed on read and never stored: there is only one date of
 * record, so the two can't drift, and changing the term length later needs no
 * backfill.
 */

/** Length of the usage term granted from the publish date. */
export const PUBLISHED_TERM_YEARS = 1;

/**
 * Expiry for a published video, or null when the publish date is unknown.
 *
 * A 29 Feb publish date lands on 1 Mar the following year, which is how JS
 * `setFullYear` rolls it — the extra day is in the brand's favour.
 */
export const publishedExpiry = (publishedAt?: Date | null): Date | null => {
    if (!publishedAt) return null;
    const at = publishedAt instanceof Date ? publishedAt : new Date(publishedAt);
    if (Number.isNaN(at.getTime())) return null;
    const expiry = new Date(at.getTime());
    expiry.setFullYear(expiry.getFullYear() + PUBLISHED_TERM_YEARS);
    return expiry;
};

/**
 * The licence-level publish date: the earliest of its video links.
 *
 * A licence can carry up to three links posted on different days. The term is
 * anchored to the first one to go live, so adding a fourth video later can
 * never push the expiry out.
 */
export const earliestPublishedDate = (
    links: ReadonlyArray<{ reelPostedAt?: Date | null }> | undefined,
): Date | null => {
    let earliest: Date | null = null;
    for (const link of links ?? []) {
        if (!link.reelPostedAt) continue;
        const at = link.reelPostedAt instanceof Date ? link.reelPostedAt : new Date(link.reelPostedAt);
        if (Number.isNaN(at.getTime())) continue;
        if (!earliest || at < earliest) earliest = at;
    }
    return earliest;
};

// ── Expiry status ──────────────────────────────────────────────────────────
//
// The five buckets the Downloads table filters and counts by. Mutually
// exclusive and total: every brand licence lands in exactly one, so the chip
// counts always sum to `all`.
//
// The rules are ALSO expressed in SQL, in
// licenses.persistence.service.ts → buildDownloadsSql. That duplication is
// deliberate and unavoidable: counting and paginating by status has to happen
// in the database (a page of ten rows cannot count the other thousand), while
// the values still have to be attached to each row on the way out. The two
// must be read together — the SQL is the authority for what a row IS, and this
// module is what the rest of the service reasons with. Change one, change both.

/** How many usage links a licence must carry before it counts as complete. */
export const REQUIRED_VIDEO_LINKS = 3;

/** A licence inside this many days of expiry is "expiring soon". */
export const EXPIRING_SOON_DAYS = 30;

export const LICENSE_EXPIRY_STATUSES = [
    "expired",
    "not-published",
    "link-not-added",
    "expiring-soon",
    "active",
] as const;

export type LicenseExpiryStatus = (typeof LICENSE_EXPIRY_STATUSES)[number];

export const isLicenseExpiryStatus = (v: unknown): v is LicenseExpiryStatus =>
    typeof v === "string" && (LICENSE_EXPIRY_STATUSES as readonly string[]).includes(v);

/**
 * SFX carry NO expiry status.
 *
 * They are free, and they carry no usage-link obligation, so every one of the
 * five buckets is either meaningless or actively wrong for them — an SFX with
 * no links is not a licence "missing" links, it is a licence that never needed
 * any. They appear in the Downloads list like anything else, but with
 * `expiryStatus: null`, and they are counted under `all` and `notApplicable`
 * rather than under any bucket.
 *
 * This is the internal marker the SQL groups by; it never reaches a client,
 * where the same thing is expressed as `null`.
 */
export const STATUS_NOT_APPLICABLE = "not-applicable";

/**
 * Which bucket one licence falls in. FIRST MATCHING RULE WINS — the order is
 * the whole definition:
 *
 *   1. expired         the term has already run out
 *   2. not-published   no link has a known publish date, so the clock has not started
 *   3. link-not-added  published, but fewer than REQUIRED_VIDEO_LINKS links
 *   4. expiring-soon   published, complete, inside EXPIRING_SOON_DAYS of expiry
 *   5. active          published, complete, more than that left
 *
 * `expired` is tested before `link-not-added` on purpose: a lapsed licence is
 * lapsed whether or not its links were ever filled in, and reporting it as an
 * outstanding admin task would be wrong. Equally, `link-not-added` is tested
 * before `expiring-soon`, so the two never overlap and a row is only ever
 * counted once.
 *
 * SFX short-circuit to null before any of this — see STATUS_NOT_APPLICABLE.
 *
 * NOTE the status is NOT the same thing as the row's countdown. A licence in
 * `link-not-added` still has a real expiry date and still shows "17 days left"
 * in its own row — see daysLeftUntil. The status decides which CHIP the row is
 * counted under, nothing more.
 */
export const expiryStatusOf = (
    publishedAt: Date | null,
    linkCount: number,
    now: Date = new Date(),
    isSfx = false,
): LicenseExpiryStatus | null => {
    if (isSfx) return null;
    const expiry = publishedExpiry(publishedAt);
    if (expiry && expiry.getTime() < now.getTime()) return "expired";
    if (!expiry) return "not-published";
    if (linkCount < REQUIRED_VIDEO_LINKS) return "link-not-added";
    const soonAt = new Date(now.getTime());
    soonAt.setDate(soonAt.getDate() + EXPIRING_SOON_DAYS);
    if (expiry.getTime() < soonAt.getTime()) return "expiring-soon";
    return "active";
};

/**
 * Whole days from `now` until the licence lapses, or null when unpublished.
 *
 * Computed server-side so every client agrees. The expiry is an INSTANT, not a
 * calendar day: it is exactly one year after the moment the video went live, so
 * a video posted at 14:30 expires at 14:30. Rounding UP (ceil) is what makes
 * the countdown read the way a person expects — any part of a day still left
 * counts as a day, so a licence lapsing later today reads "1 day left" rather
 * than "0", and only a licence already past its instant goes negative.
 *
 * Negative values are returned as-is rather than clamped, so a caller can tell
 * "lapsed yesterday" from "lapsed last year" without a second field.
 */
export const daysLeftUntil = (
    publishedAt: Date | null,
    now: Date = new Date(),
): number | null => {
    const expiry = publishedExpiry(publishedAt);
    if (!expiry) return null;
    const MS_PER_DAY = 24 * 60 * 60 * 1000;
    return Math.ceil((expiry.getTime() - now.getTime()) / MS_PER_DAY);
};
