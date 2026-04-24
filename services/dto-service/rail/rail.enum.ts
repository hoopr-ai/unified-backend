export enum RailType {
  TRACKS = "TRACKS",
  GENRES = "GENRES",
  LANGUAGES = "LANGUAGES",
  MOODS = "MOODS",
  LABELS = "LABELS",
  PLAYLISTS = "PLAYLISTS",
}

export enum RailSourceType {
  MANUAL = "MANUAL",
  QUERY = "QUERY",
  AI_QUERY = "AI_QUERY",
}

export enum RailItemType {
  TRACK = "TRACK",
  GENRE = "GENRE",
  LANGUAGE = "LANGUAGE",
  MOOD = "MOOD",
  LABEL = "LABEL",
  PLAYLIST = "PLAYLIST",
}

export enum PageName {
  HOME = "HOME",
  CHARTBUSTERS = "CHARTBUSTERS",
  INTERNATIONAL = "INTERNATIONAL",
  REGIONAL_AND_INDIE = "REGIONAL_AND_INDIE",
  HOOPR_ORIGINALS = "HOOPR_ORIGINALS",
}

export enum OwnerType {
  INTERNATIONAL = "International",
  CHARTBUSTERS = "Chartbusters",
  REGIONAL_AND_INDIE = "Regional & Indie",
  HOOPR_ORIGINALS = "Hoopr Originals",
}

// Mapping of PageName to allowed OwnerType(s)
// HOME allows all owner types, other pages are restricted to their specific type
export const PAGE_OWNER_TYPE_MAP: Record<PageName, OwnerType[] | null> = {
  [PageName.HOME]: null, // null means all owner types allowed
  [PageName.CHARTBUSTERS]: [OwnerType.CHARTBUSTERS],
  [PageName.INTERNATIONAL]: [OwnerType.INTERNATIONAL],
  [PageName.REGIONAL_AND_INDIE]: [OwnerType.REGIONAL_AND_INDIE],
  [PageName.HOOPR_ORIGINALS]: [OwnerType.HOOPR_ORIGINALS],
};

// Helper to check if an owner type is allowed for a page
export function isOwnerTypeAllowedForPage(
  ownerType: string | null | undefined,
  pageName: PageName
): boolean {
  const allowedTypes = PAGE_OWNER_TYPE_MAP[pageName];
  // HOME allows all types
  if (allowedTypes === null) return true;
  // If owner type is not set, allow it (backwards compatibility)
  if (!ownerType) return true;
  return allowedTypes.includes(ownerType as OwnerType);
}

// Get allowed owner types for a page (returns null for HOME meaning all allowed)
export function getAllowedOwnerTypesForPage(pageName: PageName): OwnerType[] | null {
  return PAGE_OWNER_TYPE_MAP[pageName];
}

// Item types that have owner type restrictions (TRACK and LABEL)
export const ITEM_TYPES_WITH_OWNER_RESTRICTION = ["TRACK", "LABEL"];

// Check if an item type has owner type restrictions
export function itemTypeHasOwnerRestriction(itemType: string): boolean {
  return ITEM_TYPES_WITH_OWNER_RESTRICTION.includes(itemType);
}
