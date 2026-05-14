// Internal brands are Hoopr-owned labels (e.g. Hoopr's own catalog and Nova
// Media Co.) that we typically exclude from CMS listings so internal token
// allocations don't pollute brand-by-brand reporting. The same enum lives in
// studio-backend-ts; keep both in sync.
export enum InternalBrand {
  Hoopr = "Hoopr",
  NovaMediaCo = "Nova Media Co.",
}

export const INTERNAL_BRAND_NAMES: readonly string[] = Object.freeze(
  Object.values(InternalBrand)
);

export const isInternalBrandName = (
  name: string | null | undefined
): boolean => {
  if (!name) return false;
  return (INTERNAL_BRAND_NAMES as string[]).includes(name);
};
