/**
 * Rewrites stored asset links (e.g. waveform / mp3 links) so the host the
 * frontend receives is always the configured CDN, regardless of what host the
 * link was stored with.
 *
 * Behaviour, driven by CDN_UNIFIED_URL:
 *   - link is empty/null           -> returned unchanged (null/undefined/"")
 *   - link is an absolute URL      -> its scheme+host is swapped for the CDN's,
 *                                     the path/query/hash are preserved
 *   - link is a bare path          -> the CDN base is prepended
 *
 * If CDN_UNIFIED_URL is not configured the link is returned unchanged so a
 * missing env var degrades gracefully instead of nulling out every link.
 */
const trimTrailingSlashes = (value: string): string => value.replace(/\/+$/, "");
const trimLeadingSlashes = (value: string): string => value.replace(/^\/+/, "");

export const toCdnUrl = <T extends string | null | undefined>(link: T): T => {
  if (!link) {
    return link;
  }

  const cdnBase = process.env.CDN_UNIFIED_URL;
  if (!cdnBase) {
    return link;
  }

  const base = trimTrailingSlashes(cdnBase);

  // Absolute URL (has a scheme://host) — swap the origin, keep path/query/hash.
  const absoluteMatch = link.match(/^[a-zA-Z][a-zA-Z\d+.-]*:\/\/[^/]+(\/.*)?$/);
  if (absoluteMatch) {
    const rest = absoluteMatch[1] ?? "";
    return `${base}${rest}` as T;
  }

  // Protocol-relative URL (//host/path) — drop the host, keep the path.
  if (link.startsWith("//")) {
    const afterHost = link.slice(2);
    const slashIdx = afterHost.indexOf("/");
    const rest = slashIdx === -1 ? "" : afterHost.slice(slashIdx);
    return `${base}${rest}` as T;
  }

  // Bare path (no base URL) — prepend the CDN base.
  return `${base}/${trimLeadingSlashes(link)}` as T;
};
