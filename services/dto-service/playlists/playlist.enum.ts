export enum PlaylistType {
  USER = "USER",
  SYSTEM = "SYSTEM",
  CURATED = "CURATED",
  PARTNER = "PARTNER",
}

// Editorial assortment a playlist belongs to — a separate axis from
// PlaylistType (which describes origin/ownership). Values deliberately mirror
// the assortment vocabulary already used across the platform (rails pageName,
// home-banner assortment, token types) so the same playlist reads consistently
// everywhere. MIXED is for playlists that deliberately span assortments.
export enum PlaylistCategory {
  HOOPR_ORIGINALS = "HOOPR_ORIGINALS",
  CHARTBUSTERS = "CHARTBUSTERS",
  INTERNATIONAL = "INTERNATIONAL",
  REGIONAL_AND_INDIE = "REGIONAL_AND_INDIE",
  MIXED = "MIXED",
}

export enum PlaylistStatus {
  ACTIVE = "ACTIVE",
  INACTIVE = "INACTIVE",
  HIDDEN = "HIDDEN",
  DELETED = "DELETED",
}
