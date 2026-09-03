import { AppError } from "../../helper-service/AppError";
import {
  findKnownCatalogues,
  findAllCatalogueRights,
  findCatalogueRights,
  upsertCatalogueRights,
  countOverridesByCatalogue,
  findOverridesForCatalogue,
  findOverridesForBrand,
  upsertBrandOverride,
  deleteBrandOverride,
  findTokenPositionForBrand,
  mergeRights,
} from "../../persistence-service/catalogue-rights/modules.export";
import type {
  AdminBrandOverride,
  AdminCatalogueRightsDetail,
  AdminCatalogueRightsListItem,
  BrandEntitlementsResponseData,
  CatalogueEntitlement,
  CatalogueRights,
  EffectiveRight,
  PartialCatalogueRights,
} from "../../dto-service/catalogue-rights/catalogue-rights.dto";
import {
  CATALOGUE_RIGHT_DEFS,
  CATALOGUE_RIGHT_KEYS,
  CATALOGUE_RIGHT_LABELS,
  emptyCatalogueRights,
  normalizeCatalogueRights,
  normalizePartialCatalogueRights,
} from "../../dto-service/catalogue-rights/catalogue-rights.dto";

// ---------------------------------------------------------------------------
// Catalogue rights business layer.
//
// Two readers, one rule:
//   • internal-fe edits catalogue defaults and per-brand overrides
//   • the Smash My Subscription screen reads the effective merge
//
// The merge itself lives in the persistence layer (mergeRights) so both paths
// resolve precedence identically — a CMS preview that disagreed with the
// customer's screen would be worse than no preview.
// ---------------------------------------------------------------------------

/**
 * Reject a catalogue name that no owner carries.
 *
 * Checked against live data rather than a constant, because catalogues are
 * free text on owners.type and a fifth one should not need a deploy. What this
 * does stop is the actual failure mode: a typo ("Chartbuster") writing a row
 * that nothing will ever read, sitting silently next to the real one.
 */
const assertKnownCatalogue = async (catalogue: string): Promise<void> => {
  const known = await findKnownCatalogues();
  if (!known.includes(catalogue)) {
    throw new AppError(
      `Unknown catalogue "${catalogue}". Known catalogues: ${known.join(", ")}.`,
      400,
    );
  }
};

const toEffectiveRights = (
  rights: CatalogueRights,
  overriddenKeys: string[],
): EffectiveRight[] =>
  CATALOGUE_RIGHT_KEYS.map((key) => ({
    key,
    label: CATALOGUE_RIGHT_LABELS[key],
    allowed: rights[key],
    source: overriddenKeys.includes(key) ? ("brand" as const) : ("catalogue" as const),
  }));

// ── Admin: list ────────────────────────────────────────────────────────────

/**
 * Every catalogue that exists, whether or not it has a defaults row yet.
 *
 * Driven by owners.type rather than by catalogue_rights, so a newly signed
 * catalogue shows up in the CMS as unconfigured instead of being invisible
 * until someone remembers to add it.
 */
export const listCatalogueRightsService = async (): Promise<
  AdminCatalogueRightsListItem[]
> => {
  const [known, configured, overrideCounts] = await Promise.all([
    findKnownCatalogues(),
    findAllCatalogueRights(),
    countOverridesByCatalogue(),
  ]);

  const byName = new Map(configured.map((row) => [row.catalogue, row]));

  // Union: a defaults row for a catalogue no owner carries any more is still
  // listed, so it can be seen and cleaned up rather than orphaned.
  const names = [...new Set([...known, ...byName.keys()])].sort((a, b) =>
    a.localeCompare(b),
  );

  return names.map((catalogue) => {
    const row = byName.get(catalogue);
    return {
      catalogue,
      rights: row ? normalizeCatalogueRights(row.rights) : emptyCatalogueRights(),
      overrideCount: overrideCounts.get(catalogue) ?? 0,
      isConfigured: Boolean(row),
      updatedAt: row?.updatedAt ?? null,
    };
  });
};

// ── Admin: detail ──────────────────────────────────────────────────────────

export const getCatalogueRightsService = async (
  catalogue: string,
): Promise<AdminCatalogueRightsDetail> => {
  await assertKnownCatalogue(catalogue);

  const [row, overrides] = await Promise.all([
    findCatalogueRights(catalogue),
    findOverridesForCatalogue(catalogue),
  ]);

  const defaults = row ? normalizeCatalogueRights(row.rights) : emptyCatalogueRights();

  return {
    catalogue,
    rights: defaults,
    updatedAt: row?.updatedAt ?? null,
    overrides: overrides.map((o): AdminBrandOverride => {
      const { rights } = mergeRights(defaults, o.rights);
      return {
        brandId: Number(o.brandId),
        brandName: (o as unknown as { brand?: { name?: string } }).brand?.name ?? null,
        rights: normalizePartialCatalogueRights(o.rights),
        effective: rights,
        note: o.note ?? null,
        updatedAt: o.updatedAt ?? null,
      };
    }),
    // Served rather than hard-coded in the CMS, so adding a right lights up in
    // internal-fe without a frontend deploy.
    definitions: CATALOGUE_RIGHT_DEFS.map((d) => ({ key: d.key, label: d.label })),
  };
};

// ── Admin: writes ──────────────────────────────────────────────────────────

export const updateCatalogueRightsService = async (
  catalogue: string,
  rights: CatalogueRights,
  updatedById: number | null,
): Promise<AdminCatalogueRightsDetail> => {
  await assertKnownCatalogue(catalogue);
  await upsertCatalogueRights(catalogue, rights, updatedById);
  return getCatalogueRightsService(catalogue);
};

export const updateBrandOverrideService = async (
  catalogue: string,
  brandId: number,
  rights: PartialCatalogueRights,
  note: string | null,
  updatedById: number | null,
): Promise<AdminCatalogueRightsDetail> => {
  await assertKnownCatalogue(catalogue);
  await upsertBrandOverride(brandId, catalogue, rights, note, updatedById);
  return getCatalogueRightsService(catalogue);
};

export const deleteBrandOverrideService = async (
  catalogue: string,
  brandId: number,
): Promise<AdminCatalogueRightsDetail> => {
  await assertKnownCatalogue(catalogue);
  const removed = await deleteBrandOverride(brandId, catalogue);
  if (!removed) {
    throw new AppError(
      `No override for brand ${brandId} on "${catalogue}".`,
      404,
    );
  }
  return getCatalogueRightsService(catalogue);
};

// ── Brand-facing read ──────────────────────────────────────────────────────

/**
 * The My Subscription screen, server-side: tokens and rights per catalogue.
 *
 * Driven by the brand's TOKEN POSITION, not by the catalogue list — a brand
 * only sees cards for catalogues it actually holds tokens in, which is why the
 * screenshot shows four and not every catalogue in the system.
 */
export const getBrandEntitlementsService = async (
  brandId: number,
): Promise<BrandEntitlementsResponseData> => {
  const [positions, defaults, overrides] = await Promise.all([
    findTokenPositionForBrand(brandId),
    findAllCatalogueRights(),
    findOverridesForBrand(brandId),
  ]);

  const defaultsByName = new Map(defaults.map((d) => [d.catalogue, d.rights]));
  const overrideByName = new Map(overrides.map((o) => [o.catalogue, o.rights]));

  // token_assigned is one row per purchase, so a brand that topped up three
  // times has three rows for the same catalogue. Fold them into one card.
  const grouped = new Map<
    string,
    { assigned: number; balance: number; unlimited: boolean; expiry: Date | null }
  >();

  for (const row of positions) {
    const key = row.type;
    const acc = grouped.get(key) ?? {
      assigned: 0,
      balance: 0,
      unlimited: false,
      expiry: null,
    };
    acc.assigned += Number(row.totalAssignedToken ?? 0);
    acc.balance += Number(row.tokenBalance ?? 0);
    acc.unlimited = acc.unlimited || Boolean(row.isUnlimited);
    // Soonest expiry wins — it is the date the entitlement first shrinks, and
    // the one the screen has to warn about.
    if (row.expiryDate) {
      const d = new Date(row.expiryDate);
      if (!acc.expiry || d < acc.expiry) acc.expiry = d;
    }
    grouped.set(key, acc);
  }

  const catalogues: CatalogueEntitlement[] = [...grouped.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([catalogue, acc]) => {
      const { rights, overriddenKeys } = mergeRights(
        defaultsByName.get(catalogue),
        overrideByName.get(catalogue),
      );
      return {
        catalogue,
        tokensAssigned: acc.assigned,
        tokenBalance: acc.balance,
        isUnlimited: acc.unlimited,
        expiryDate: acc.expiry,
        rights: toEffectiveRights(rights, overriddenKeys),
        hasOverride: overriddenKeys.length > 0,
      };
    });

  // null, not a number, when anything is unlimited: summing a finite total
  // beside an ∞ card would understate what the brand actually holds.
  const anyUnlimited = catalogues.some((c) => c.isUnlimited);
  const totalTokens = anyUnlimited
    ? null
    : catalogues.reduce((sum, c) => sum + c.tokensAssigned, 0);

  return { brandId, totalTokens, catalogues };
};
