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
