// ── Catalogue rights vocabulary ───────────────────────────────────────────
//
// THE single source of truth for which rights exist and what they are called.
// The Joi schema, the persistence merge, the CMS and the subscription screen
// all derive from this list — adding a seventh right is one entry here plus a
// backfill, with no migration (the flags live in a jsonb blob for exactly that
// reason).
//
// Order is the screen's reading order (left column, right column, row by row),
// so a client can render the two-column grid straight from the array without
// carrying its own ordering.

export const CATALOGUE_RIGHT_DEFS = [
  { key: "unlimitedDownloads", label: "Unlimited downloads" },
  { key: "worldwidePerpetuity", label: "Worldwide perpetuity" },
  { key: "channelClearance", label: "Channel clearance" },
  { key: "brandedContent", label: "Branded content & Collaborations" },
  { key: "socialOrganic", label: "Social media & organic content" },
  { key: "audiobooksPodcasts", label: "Audiobooks & podcasts" },
] as const;

export type CatalogueRightKey = (typeof CATALOGUE_RIGHT_DEFS)[number]["key"];

export const CATALOGUE_RIGHT_KEYS: CatalogueRightKey[] = CATALOGUE_RIGHT_DEFS.map(
  (d) => d.key,
) as CatalogueRightKey[];

export const CATALOGUE_RIGHT_LABELS: Record<CatalogueRightKey, string> =
  Object.fromEntries(CATALOGUE_RIGHT_DEFS.map((d) => [d.key, d.label])) as Record<
    CatalogueRightKey,
    string
  >;

/** Every right present and decided. What a catalogue DEFAULT always is. */
export type CatalogueRights = Record<CatalogueRightKey, boolean>;

/**
 * A brand override. PARTIAL on purpose — only the keys this brand negotiated.
 * A full copy would freeze all six at write time, so a later change to the
 * catalogue default would silently skip every brand carrying an override.
 */
export type PartialCatalogueRights = Partial<CatalogueRights>;

/** Every right false. The floor a missing/empty row falls back to. */
export const emptyCatalogueRights = (): CatalogueRights =>
  Object.fromEntries(CATALOGUE_RIGHT_KEYS.map((k) => [k, false])) as CatalogueRights;

/**
 * Coerce a stored jsonb blob into a complete, typed rights object.
 * Unknown keys are dropped and missing keys default to false, so a legacy or
 * hand-edited row can never crash a render or leak a stray flag to a client.
 */
export const normalizeCatalogueRights = (raw: unknown): CatalogueRights => {
  const out = emptyCatalogueRights();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  const r = raw as Record<string, unknown>;
  for (const key of CATALOGUE_RIGHT_KEYS) {
    if (typeof r[key] === "boolean") out[key] = r[key] as boolean;
  }
  return out;
};

/** Same, but keeps absence as absence — the shape an override is stored in. */
export const normalizePartialCatalogueRights = (
  raw: unknown,
): PartialCatalogueRights => {
  const out: PartialCatalogueRights = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  const r = raw as Record<string, unknown>;
  for (const key of CATALOGUE_RIGHT_KEYS) {
    if (typeof r[key] === "boolean") out[key] = r[key] as boolean;
  }
  return out;
};

// ── Read shapes ───────────────────────────────────────────────────────────

/** Which layer decided one flag. Lets the CMS badge exactly what was negotiated. */
export type RightSource = "catalogue" | "brand";

export interface EffectiveRight {
  key: CatalogueRightKey;
  label: string;
  allowed: boolean;
  source: RightSource;
}

/** One card on the My Subscription screen. */
export interface CatalogueEntitlement {
  catalogue: string;
  /** Sum of totalAssignedToken across this brand's live rows for the catalogue. */
  tokensAssigned: number;
  tokenBalance: number;
  /** true when any row is unlimited — the screen renders ∞ instead of a number. */
  isUnlimited: boolean;
  /** Soonest expiry across the rows, or null when none is set. */
  expiryDate: Date | null;
  rights: EffectiveRight[];
  /** true when any right came from a brand override. */
  hasOverride: boolean;
}

export interface BrandEntitlementsResponseData {
  brandId: number;
  /** Total across catalogues; null when any catalogue is unlimited. */
  totalTokens: number | null;
  catalogues: CatalogueEntitlement[];
}

// ── Admin (internal-fe) shapes ────────────────────────────────────────────

export interface AdminCatalogueRightsListItem {
  catalogue: string;
  rights: CatalogueRights;
  /** How many brands deviate from this catalogue's defaults. */
  overrideCount: number;
  /** Catalogues seen on owners.type that have no defaults row yet. */
  isConfigured: boolean;
  updatedAt: Date | null;
}

export interface AdminBrandOverride {
  brandId: number;
  brandName: string | null;
  /** Only the negotiated keys. */
  rights: PartialCatalogueRights;
  /** Defaults merged with the override — what this brand actually sees. */
  effective: CatalogueRights;
  note: string | null;
  updatedAt: Date | null;
}

export interface AdminCatalogueRightsDetail {
  catalogue: string;
  rights: CatalogueRights;
  updatedAt: Date | null;
  overrides: AdminBrandOverride[];
  /** The vocabulary, so the CMS renders the checkbox list from the server. */
  definitions: { key: CatalogueRightKey; label: string }[];
}
