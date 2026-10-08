import { Platform, UNAUTHENTICATED_RESTRICTED_OWNER_NAMES } from "../../dto-service/modules.export";
import {
  getOwnerIdentitiesByNames,
  getRestrictedOwnersByBrandId,
  getActiveBrandTokenGrants,
  type ActiveTokenGrant,
} from "../../persistence-service/exports";
import { getSpendableTrialTypes } from "../trial/trial.service";

/**
 * Catalogue visibility for one viewer (a brand, or an anonymous visitor).
 *
 * The default-restricted labels (YRF Music, Zee Music Company — see
 * UNAUTHENTICATED_RESTRICTED_OWNER_NAMES) are hidden from everyone *per label*:
 * a brand only sees a restricted label once it holds an active token that
 * covers that specific label. Holding a Chartbusters token scoped to YRF does
 * not reveal Zee Music Company, and vice versa.
 *
 * "Hidden" means hidden everywhere: the label's tracks are excluded from every
 * listing query, and the label itself is dropped from rail LABEL items so the
 * card never renders at all.
 */
export interface ViewerOwnerAccess {
  /** Owner ids whose tracks this viewer must not see. undefined = no exclusion. */
  excludeOwnerIds?: string[];
  /** Owner ids of restricted labels this viewer must not see at all. */
  blockedOwnerIds: Set<string>;
  /** ownerCodes of the same blocked labels — rail LABEL items key on ownerCode. */
  blockedOwnerCodes: Set<string>;
  /** Token types the brand holds an active balance for (any owner scope). */
  activeTokenTypes: Set<string>;
  /** Owner ids explicitly named by an active, owner-scoped token allocation. */
  tokenOwnerIds: Set<string>;
  /**
   * Types held via an allocation with no owner scope (or unlimited) — covers
   * every owner of that type. Also the Smash trial's types that still have a
   * credit left, so their tracks show the credit cost instead of a price.
   */
  blanketTokenTypes: Set<string>;
}

const EMPTY_ACCESS_FIELDS = {
  activeTokenTypes: new Set<string>(),
  tokenOwnerIds: new Set<string>(),
  blanketTokenTypes: new Set<string>(),
};

/**
 * Staff surfaces (the internal CMS, studio) curate the whole catalogue — rails,
 * track pickers, label lists — so none of the brand-facing gating applies to
 * them. They must keep seeing YRF and Zee whether or not any brand holds tokens,
 * otherwise a curator cannot put those labels on a rail in the first place.
 */
export const isInternalViewerPlatform = (platform?: string | null): boolean =>
  platform === Platform.INTERNAL || platform === Platform.STUDIO;

const UNRESTRICTED_ACCESS: ViewerOwnerAccess = {
  excludeOwnerIds: undefined,
  blockedOwnerIds: new Set<string>(),
  blockedOwnerCodes: new Set<string>(),
  ...EMPTY_ACCESS_FIELDS,
};

/**
 * Mirrors tokenSelectionTier() in the token persistence service: an unlimited
 * allocation, or one with an empty ownerIds list, covers every owner of its
 * type; anything else covers only the owners it names.
 */
const indexGrants = (grants: ActiveTokenGrant[]) => {
  const activeTokenTypes = new Set<string>();
  const tokenOwnerIds = new Set<string>();
  const blanketTokenTypes = new Set<string>();
  for (const grant of grants) {
    activeTokenTypes.add(grant.type);
    if (grant.isUnlimited || grant.ownerIds.length === 0) {
      blanketTokenTypes.add(grant.type);
      continue;
    }
    for (const ownerId of grant.ownerIds) tokenOwnerIds.add(ownerId);
  }
  return { activeTokenTypes, tokenOwnerIds, blanketTokenTypes };
};

/**
 * Resolve what the viewer is allowed to see. Callers should resolve this ONCE
 * per request and thread it through, rather than re-querying per hydration step.
 */
export const resolveViewerOwnerAccess = async (
  brandId?: number | null,
  platform?: string | null,
): Promise<ViewerOwnerAccess> => {
  // Internal CMS / studio callers see everything.
  if (isInternalViewerPlatform(platform)) return UNRESTRICTED_ACCESS;

  const restrictedOwners = UNAUTHENTICATED_RESTRICTED_OWNER_NAMES.length > 0
    ? await getOwnerIdentitiesByNames(UNAUTHENTICATED_RESTRICTED_OWNER_NAMES)
    : [];

  // Anonymous viewer: every restricted label is hidden, no tokens to unlock them.
  if (!brandId) {
    const blockedOwnerIds = new Set(restrictedOwners.map((owner) => owner.id));
    const blockedOwnerCodes = new Set(
      restrictedOwners.map((owner) => owner.ownerCode).filter((code): code is string => !!code),
    );
    return {
      excludeOwnerIds: blockedOwnerIds.size > 0 ? Array.from(blockedOwnerIds) : undefined,
      blockedOwnerIds,
      blockedOwnerCodes,
      ...EMPTY_ACCESS_FIELDS,
    };
  }

  const [brandRestrictedOwnerIds, grants] = await Promise.all([
    getRestrictedOwnersByBrandId(brandId),
    getActiveBrandTokenGrants(brandId),
  ]);
  const { activeTokenTypes, tokenOwnerIds, blanketTokenTypes } = indexGrants(grants);

  const excluded = new Set<string>();

  // A default-restricted label opens up only for a brand that holds a token
  // covering it — either scoped to that label, or a blanket allocation of the
  // label's type (which the deduction path would accept for it too).
  for (const owner of restrictedOwners) {
    const unlocked = tokenOwnerIds.has(owner.id)
      || (owner.type != null && blanketTokenTypes.has(owner.type));
    if (!unlocked) excluded.add(owner.id);
  }

  // An owner the internal console put on the brand's restrictedOwners list stays
  // blocked, EXCEPT when the brand holds an allocation scoped to that owner —
  // brands are seeded with the restricted labels at creation time, so a Zee
  // allocation has to win over that seed without anyone hand-editing the row.
  for (const ownerId of brandRestrictedOwnerIds) {
    if (tokenOwnerIds.has(ownerId)) continue;
    excluded.add(ownerId);
  }

  // A brand on the Smash trial (no paid allocation) can license the trial's
  // types while it has a credit of that type left — the same blanket cover a
  // paid allocation gives. Added after the restricted-label pass on purpose:
  // the trial never unlocks YRF / Zee. Chartbusters is not a trial type, so it
  // stays Enterprise Only.
  if (grants.length === 0) {
    for (const type of await getSpendableTrialTypes(brandId)) {
      activeTokenTypes.add(type);
      blanketTokenTypes.add(type);
    }
  }

  // Label cards follow the exact same set, so a label whose tracks are all
  // hidden can never render as a dead card that leads to an empty page.
  const blockedOwnerCodes = new Set<string>();
  for (const owner of restrictedOwners) {
    if (owner.ownerCode && excluded.has(owner.id)) blockedOwnerCodes.add(owner.ownerCode);
  }

  return {
    excludeOwnerIds: excluded.size > 0 ? Array.from(excluded) : undefined,
    blockedOwnerIds: excluded,
    blockedOwnerCodes,
    activeTokenTypes,
    tokenOwnerIds,
    blanketTokenTypes,
  };
};

/**
 * Does the viewer hold a token that covers this track's owner? Owner-scoped
 * allocations only cover the owners they name, so a type-level check is not
 * enough — that is what let a YRF-only brand see Zee content as token-covered.
 */
export const viewerHasTokenForOwner = (
  access: Pick<ViewerOwnerAccess, "tokenOwnerIds" | "blanketTokenTypes"> | undefined,
  ownerIds: readonly string[] | null | undefined,
  ownerType?: string | null,
): boolean => {
  if (!access) return false;
  if (ownerType && access.blanketTokenTypes.has(ownerType)) return true;
  if (!ownerIds) return false;
  for (const ownerId of ownerIds) {
    if (access.tokenOwnerIds.has(ownerId)) return true;
  }
  return false;
};

/**
 * Tracks sold for their SKU price only, never against a token. Every viewer,
 * token holder or not, sees the price and no token, and the token-license
 * endpoint refuses them. Each needs a SKU row or it has no price to show. To
 * add one, append its trackCode.
 */
export const PRICE_ONLY_TRACK_CODES: readonly string[] = [
  "19714", // Sarfira — Parv Music, SickLot (Songfest)
];

export const isPriceOnlyTrack = (trackCode: string | null | undefined): boolean =>
  !!trackCode && PRICE_ONLY_TRACK_CODES.includes(String(trackCode));

/** Is this label hidden from the viewer entirely (no token for it)? */
export const isOwnerBlockedForViewer = (
  access: Pick<ViewerOwnerAccess, "blockedOwnerIds" | "blockedOwnerCodes">,
  owner: { id?: string | null; ownerCode?: string | null },
): boolean => {
  if (owner.id && access.blockedOwnerIds.has(owner.id)) return true;
  if (owner.ownerCode && access.blockedOwnerCodes.has(owner.ownerCode)) return true;
  return false;
};
