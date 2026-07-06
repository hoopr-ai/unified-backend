// Canonical catalog of INTERNAL CMS functionalities.
//
// Each id maps ~1:1 to a CMS item (card + route) in internal-fe. A non-admin
// user is granted a subset of these; ADMIN sees everything regardless of the
// list. Keep this list in sync with internal-fe's src/services/functionalities.ts.

export const ALLOWED_FUNCTIONALITIES = [
  // Music
  "rails",
  "playlists",
  "music-ingestion",
  "track-pricing",
  // Sales
  "sales-crm",
  "client-credentials",
  "tokens",
  "sales-tool",
  "video-links",
  "sage",
  "sftp-manager",
  "hoopr-b2c-dashboard",
  "pay-per-track-dashboard",
  "youtube",
  "app-music-programming",
  "soundtracking",
  "faq",
  // Songfest
  "studio-briefs",
  // Marketing (no home-page card; direct-URL route only)
  "marketing",
  // Admin
  "admin-dashboard",
  "internal-users",
  "banners",
] as const;

export type Functionality = (typeof ALLOWED_FUNCTIONALITIES)[number];

export const isAllowedFunctionality = (v: string): v is Functionality =>
  (ALLOWED_FUNCTIONALITIES as readonly string[]).includes(v);

// Safely pull the functionality list out of the `restrictions` JSONB, which is
// a union (the new { functionalities } object, the legacy entry array, or null).
// Only the object shape carries functionalities — anything else yields [].
export const extractFunctionalities = (
  restrictions: { functionalities?: string[] } | unknown[] | null | undefined
): string[] => {
  if (
    restrictions &&
    !Array.isArray(restrictions) &&
    Array.isArray((restrictions as { functionalities?: string[] }).functionalities)
  ) {
    return (restrictions as { functionalities: string[] }).functionalities;
  }
  return [];
};
