import type { Request } from "express";
import { recordUtmLinkVisit } from "../../persistence-service/attribution/modules.export";

/**
 * The campaign tags one request arrived with.
 *
 * enterprise-fe reads these off the landing URL once at boot and spreads them
 * onto every call a page makes (`getUtm()` in src/lib/analytics/utm.ts), so
 * they arrive in the body on POST /tracks and in the query string on
 * GET /label-pages. Same five keys either way.
 */
export interface UtmTags {
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string;
  utmTerm?: string;
}

/** The surface a tagged visit landed on. Recorded in the row's label. */
export const UtmContext = {
  TRACK_LISTING: "TRACK_LISTING",
  LABEL_PAGE_LIST: "LABEL_PAGE_LIST",
} as const;

export type UtmContextName = (typeof UtmContext)[keyof typeof UtmContext];

// The columns are TEXT, so this is not a storage limit — it is a guard against
// a mangled URL arriving where a campaign name belongs.
const MAX_TAG_LENGTH = 255;

/** Marks a row as a visit rather than a link somebody built in the Builder. */
export const VISIT_LABEL_PREFIX = "visit:";

const toTag = (...candidates: unknown[]): string => {
  const raw = candidates.find(
    (value) => typeof value === "string" && value.trim(),
  );
  return typeof raw === "string" ? raw.trim().slice(0, MAX_TAG_LENGTH) : "";
};

/**
 * Pull the tags out of a request body or query string.
 *
 * The FE sends snake_case (`utm_source`); camelCase is accepted too so either
 * convention works from a script or a future caller. Missing tags come back as
 * "" rather than undefined, because that is how they are compared below.
 */
export const parseUtmTags = (input: Record<string, unknown> = {}): UtmTags => ({
  utmSource: toTag(input.utm_source, input.utmSource),
  utmMedium: toTag(input.utm_medium, input.utmMedium),
  utmCampaign: toTag(input.utm_campaign, input.utmCampaign),
  utmContent: toTag(input.utm_content, input.utmContent),
  utmTerm: toTag(input.utm_term, input.utmTerm),
});

export const hasUtmTags = (tags: UtmTags): boolean =>
  Boolean(
    tags.utmSource ||
      tags.utmMedium ||
      tags.utmCampaign ||
      tags.utmContent ||
      tags.utmTerm,
  );

const header = (req: Request, name: string): string => {
  const value = req.headers[name];
  return typeof value === "string" ? value : "";
};

/**
 * The page the visitor was on, with any utm_* stripped back off.
 *
 * `utm_links.destination_url` means "the URL before the tags were attached",
 * so it has to be the tagless form for a visit row to line up with the link a
 * marketer registered. The Referer is the FE page itself; Origin is the
 * fallback when the browser sends no Referer, and this API's own URL is the
 * last resort, since the column is NOT NULL.
 */
export const resolveDestinationUrl = (req: Request): string => {
  const candidate =
    header(req, "referer") || header(req, "referrer") || header(req, "origin");
  if (candidate) {
    try {
      const url = new URL(candidate);
      for (const key of [...url.searchParams.keys()]) {
        if (key.toLowerCase().startsWith("utm_")) url.searchParams.delete(key);
      }
      return url.toString();
    } catch {
      // A Referer that will not parse is worth keeping verbatim — it is still
      // the only record of where the visit came from.
      return candidate.slice(0, 2000);
    }
  }
  return `${req.protocol}://${req.get("host") ?? "api"}${req.path}`;
};

/**
 * destination_url with the tags put back on, the same shape the Builder
 * generates (utm_normalize.build_url in content-recommendation). Empty tags
 * are left off rather than written as `utm_medium=`.
 */
export const buildFullUrl = (destinationUrl: string, tags: UtmTags): string => {
  const pairs: [string, string][] = [
    ["utm_source", tags.utmSource ?? ""],
    ["utm_medium", tags.utmMedium ?? ""],
    ["utm_campaign", tags.utmCampaign ?? ""],
    ["utm_content", tags.utmContent ?? ""],
    ["utm_term", tags.utmTerm ?? ""],
  ].filter((pair): pair is [string, string] => Boolean(pair[1]));

  try {
    const url = new URL(destinationUrl);
    for (const [key, value] of pairs) url.searchParams.append(key, value);
    return url.toString();
  } catch {
    const query = new URLSearchParams(pairs).toString();
    const separator = destinationUrl.includes("?") ? "&" : "?";
    return `${destinationUrl}${separator}${query}`;
  }
};

/** "visit:LABEL_PAGE_LIST", plus the surface's own filters when it has any. */
const buildLabel = (
  context: UtmContextName,
  extra: Record<string, unknown>,
): string => {
  const detail = Object.entries(extra)
    .filter(([, value]) => value !== null && value !== undefined && value !== "")
    .map(([key, value]) => `${key}=${Array.isArray(value) ? value.join("|") : String(value)}`)
    .join(" ");
  return `${VISIT_LABEL_PREFIX}${context}${detail ? ` ${detail}` : ""}`.slice(0, 500);
};

/**
 * Record that a visit arrived on `context` through this campaign.
 *
 * Signed in or not: a campaign's whole job is bringing people who do not have
 * an account yet, so an anonymous arrival is the one we can least afford to
 * drop. The visitor's id and email are filled when a session happens to be
 * present, into the same columns the Builder uses for the link's author.
 *
 * Fire-and-forget by design: attribution is never worth failing or slowing the
 * page it rode in on, so this returns void and swallows its own errors.
 * Untagged visits, which are most of them, write nothing at all.
 *
 * `extra` is the surface's own context — the ownerCode/subType filters a
 * listing call carried, say. It goes into the label, the only free-text column
 * `utm_links` has.
 */
export const recordUtmArrival = (
  context: UtmContextName,
  tags: UtmTags,
  req: Request,
  session?: { userId?: number; email?: string },
  extra: Record<string, unknown> = {},
): void => {
  if (!hasUtmTags(tags)) return;

  const destinationUrl = resolveDestinationUrl(req);

  void recordUtmLinkVisit({
    destinationUrl,
    // NOT NULL in the table; "" is how an absent tag is stored.
    utmSource: tags.utmSource ?? "",
    utmMedium: tags.utmMedium ?? "",
    utmCampaign: tags.utmCampaign ?? "",
    utmContent: tags.utmContent || null,
    utmTerm: tags.utmTerm || null,
    fullUrl: buildFullUrl(destinationUrl, tags),
    label: buildLabel(context, extra),
    createdByEmail: session?.email ?? null,
    createdByUserId: session?.userId ?? null,
  }).catch((error) => {
    console.error(`[UTM] Failed to record ${context} arrival:`, error);
  });
};
