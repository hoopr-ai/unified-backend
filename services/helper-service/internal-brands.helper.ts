// Internal brands are Hoopr-owned accounts that we typically exclude from CMS
// listings so internal token allocations don't pollute brand-by-brand
// reporting. Maintained as brand IDs (not names) so renames or casing
// differences in the brands table can't silently break the exclusion. The same
// list lives in studio-backend-ts; keep both in sync.
//
// Note: "Nova Media Co." has no row in the brands table today — if one is
// created, add its ID here.
export const INTERNAL_BRAND_IDS: readonly number[] = Object.freeze([
  20,
  24, // hoopr (primary internal account)
  179, // hoopr (duplicate account)
  192, // hoopr (duplicate account)
  209, // hoopr (duplicate account)
]);

export const isInternalBrandId = (
  id: number | null | undefined
): boolean => {
  if (id == null) return false;
  return (INTERNAL_BRAND_IDS as number[]).includes(Number(id));
};
