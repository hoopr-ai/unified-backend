// INTERNAL CMS functionality helpers.
//
// The catalog of functionality ids lives in internal-fe
// (src/services/functionalities.ts) and is the single source of truth. The
// backend no longer validates grant ids against a fixed list — whatever the
// grant UI sends is stored as-is (each CMS endpoint enforces its own
// server-side authorization, so an unknown id unlocks nothing).

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
