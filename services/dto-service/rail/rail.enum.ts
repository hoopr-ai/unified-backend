export enum RailType {
  TRACKS = "TRACKS",
  GENRES = "GENRES",
  LANGUAGES = "LANGUAGES",
  MOODS = "MOODS",
  LABELS = "LABELS",
  PLAYLISTS = "PLAYLISTS",
  ARTISTS = "ARTISTS",
  OCCASIONS = "OCCASIONS",
  QUICK_ADDS = "QUICK_ADDS",
  BANNERS = "BANNERS",
  // App-home content widgets (heading image, promo card, category grid,
  // tagline rotator, feature card, footer stats). These carry no rail_items —
  // their content lives in the rail's `config` column and is discriminated by
  // `subType`. Listed so the CMS can round-trip them without coercing `type`.
  WIDGET = "WIDGET",
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
  ARTIST = "ARTIST",
  OCCASION = "OCCASION",
  QUICK_ADD = "QUICK_ADD",
  BANNER = "BANNER",
}

export enum PageName {
  HOME = "HOME",
  CHARTBUSTERS = "CHARTBUSTERS",
  INTERNATIONAL = "INTERNATIONAL",
  REGIONAL_AND_INDIE = "REGIONAL_AND_INDIE",
  HOOPR_ORIGINALS = "HOOPR_ORIGINALS",
  APP_HOME = "APP_HOME",
  APP_HOME_ORGANIC = "APP_HOME_ORGANIC",
  APP_HOME_BRAND_COLLAB = "APP_HOME_BRAND_COLLAB",
  HOOPR_PLAYLIST = "HOOPR_PLAYLIST",
  HOOPR_SFX = "HOOPR_SFX",
  APP_PLAYLIST = "APP_PLAYLIST",
  APP_SFX = "APP_SFX",
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
  [PageName.APP_HOME]: null, // null means all owner types allowed
  [PageName.APP_HOME_ORGANIC]: null, // null means all owner types allowed
  [PageName.APP_HOME_BRAND_COLLAB]: null, // null means all owner types allowed
  [PageName.HOOPR_PLAYLIST]: null, // null means all owner types allowed
  [PageName.HOOPR_SFX]: null, // null means all owner types allowed
  [PageName.APP_PLAYLIST]: null, // null means all owner types allowed
  [PageName.APP_SFX]: null, // null means all owner types allowed
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

// Pages whose rails must be fully hand-curated: only MANUAL sourceType is
// allowed (no QUERY / AI_QUERY). The APP_HOME app CMS curates everything by hand.
export const MANUAL_ONLY_PAGES: PageName[] = [PageName.APP_HOME];

// Check if a page only allows MANUAL rails
export function isManualOnlyPage(pageName: string): boolean {
  return MANUAL_ONLY_PAGES.includes(pageName as PageName);
}

// Pages that must NOT get an auto-generated "Recommended For You" rail — it is
// neither created on-demand nor updated by the scheduler for these hand-curated
// playlist / SFX surfaces.
export const RECOMMENDATION_EXCLUDED_PAGES: PageName[] = [
  PageName.HOOPR_PLAYLIST,
  PageName.HOOPR_SFX,
  PageName.APP_PLAYLIST,
  PageName.APP_SFX,
];

// Check if a page is excluded from the "Recommended For You" rail
export function isRecommendationExcludedPage(
  pageName: string | null | undefined
): boolean {
  return RECOMMENDATION_EXCLUDED_PAGES.includes(pageName as PageName);
}
