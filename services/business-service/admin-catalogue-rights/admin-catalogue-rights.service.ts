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
  findOwnerNames,
  mergeRights,
} from "../../persistence-service/catalogue-rights/modules.export";
import type {
  DealHeader,
  AdminBrandOverride,
  AdminCatalogueRightsDetail,
  AdminCatalogueRightsListItem,
  BrandEntitlementsResponseData,
  CatalogueEntitlement,
  CatalogueSubEntitlement,
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

/**
 * Resolve ONE plan header from a brand's allocations.
 *
 * These fields are copied onto every token_assigned row, so four catalogues
 * mean four copies that are free to disagree — nothing in the schema prevents
 * it. Picking "whichever row came back first" would make the customer's header
 * depend on row order, so the rule is explicit and stable:
 *
 *   1. Only rows that actually carry a title or a startDate are candidates —
 *      pre-deal-fields allocations can never win.
 *   2. Newest startDate wins; createdAt breaks a tie. The most recently agreed
 *      deal is the current one.
 *   3. Dates come from the SAME row as the title, never mixed. A start from one
 *      deal beside an expiry from another describes a window that never existed.
 *
 * `isConsistent` reports whether the candidates agreed, so a drift is visible
 * instead of silently resolved. If drift turns out to be common, the fix is a
 * brand_deals table these rows point at — the columns were added additively to
 * keep that move cheap.
 */
const pickDealHeader = (
  rows: {
    startDate?: Date | null;
    title?: string | null;
    subTitle?: string | null;
    expiryDate?: Date | null;
    createdAt?: Date;
  }[],
): DealHeader | null => {
  const candidates = rows.filter((r) => r.title || r.startDate);
  if (!candidates.length) return null;

  const time = (d: Date | null | undefined) => (d ? new Date(d).getTime() : 0);
  const sorted = [...candidates].sort(
    (a, b) =>
      time(b.startDate) - time(a.startDate) || time(b.createdAt) - time(a.createdAt),
  );
  const winner = sorted[0];

  const key = (r: (typeof candidates)[number]) =>
    `${r.title ?? ""}|${r.subTitle ?? ""}|${time(r.startDate)}`;
  const isConsistent = new Set(candidates.map(key)).size === 1;

  const expiry = winner.expiryDate ? new Date(winner.expiryDate) : null;

  return {
    title: winner.title ?? null,
    subTitle: winner.subTitle ?? null,
    startDate: winner.startDate ? new Date(winner.startDate) : null,
    expiryDate: expiry,
    status: expiry ? (expiry.getTime() > Date.now() ? "ACTIVE" : "EXPIRED") : null,
    isConsistent,
  };
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

  // Resolve every scoped label in one query, so a brand with several
  // owner-scoped packs does not fan out into a lookup per allocation.
  const ownerNames = await findOwnerNames(
    positions.flatMap((p) => ((p.ownerIds ?? []) as string[])),
  );

  const defaultsByName = new Map(defaults.map((d) => [d.catalogue, d.rights]));
  const overrideByName = new Map(overrides.map((o) => [o.catalogue, o.rights]));

  // token_assigned is one row per purchase, so a brand that topped up three
  // times has three rows for the same catalogue. Fold them into one card.
  const grouped = new Map<
    string,
    {
      assigned: number;
      balance: number;
      unlimited: boolean;
      expiry: Date | null;
      start: Date | null;
      subs: Map<
        string,
        { ids: string[]; assigned: number; balance: number; unlimited: boolean; expiry: Date | null }
      >;
    }
  >();

  for (const row of positions) {
    const key = row.type;
    const acc = grouped.get(key) ?? {
      assigned: 0,
      balance: 0,
      unlimited: false,
      expiry: null,
      start: null,
      subs: new Map<
        string,
        { ids: string[]; assigned: number; balance: number; unlimited: boolean; expiry: Date | null }
      >(),
    };
    acc.assigned += Number(row.totalAssignedToken ?? 0);
    // Sub-bucket: blanket rows share one key; a scoped row keys on its SORTED
    // owner set, so two packs naming the same label merge and two naming
    // different labels stay apart.
    const ids = [...(((row.ownerIds ?? []) as string[]))].filter(Boolean).sort();
    const subKey = ids.length ? ids.join(",") : "*";
    const sub = acc.subs.get(subKey) ?? {
      ids,
      assigned: 0,
      balance: 0,
      unlimited: false,
      expiry: null as Date | null,
    };
    sub.assigned += Number(row.totalAssignedToken ?? 0);
    sub.balance += Number(row.tokenBalance ?? 0);
    sub.unlimited = sub.unlimited || Boolean(row.isUnlimited);
    if (row.expiryDate) {
      const e = new Date(row.expiryDate);
      if (!sub.expiry || e < sub.expiry) sub.expiry = e;
    }
    acc.subs.set(subKey, sub);
    acc.balance += Number(row.tokenBalance ?? 0);
    acc.unlimited = acc.unlimited || Boolean(row.isUnlimited);
    // Soonest expiry wins — it is the date the entitlement first shrinks, and
    // the one the screen has to warn about.
    if (row.expiryDate) {
      const d = new Date(row.expiryDate);
      if (!acc.expiry || d < acc.expiry) acc.expiry = d;
    }
    // Latest start, mirroring the header rule: the most recent top-up is when
    // the catalogue's current entitlement actually began.
    if (row.startDate) {
      const d = new Date(row.startDate);
      if (!acc.start || d > acc.start) acc.start = d;
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
        startDate: acc.start,
        rights: toEffectiveRights(rights, overriddenKeys),
        hasOverride: overriddenKeys.length > 0,
        subCategories: [...acc.subs.values()]
          .map((sub): CatalogueSubEntitlement => {
            const owners = sub.ids.map((id) => ({
              id,
              ownerCode: ownerNames.get(id)?.ownerCode ?? id,
              name: ownerNames.get(id)?.name ?? null,
            }));
            return {
              scope: owners.length ? "owner" : "catalogue",
              // A scoped bucket is named by its labels; the blanket one says so
              // explicitly rather than repeating the catalogue name, so the two
              // read differently at a glance.
              label: owners.length
                ? owners.map((o) => o.name ?? o.ownerCode).join(", ")
                : `All ${catalogue}`,
              owners,
              tokensAssigned: sub.assigned,
              tokenBalance: sub.balance,
              isUnlimited: sub.unlimited,
              expiryDate: sub.expiry,
            };
          })
          // Blanket first, then scoped packs alphabetically — the widest
          // entitlement reads first, which is how the card should render.
          .sort((a, b) =>
            a.scope === b.scope ? a.label.localeCompare(b.label) : a.scope === "catalogue" ? -1 : 1,
          ),
      };
    });

  // null, not a number, when anything is unlimited: summing a finite total
  // beside an ∞ card would understate what the brand actually holds.
  const anyUnlimited = catalogues.some((c) => c.isUnlimited);
  const totalTokens = anyUnlimited
    ? null
    : catalogues.reduce((sum, c) => sum + c.tokensAssigned, 0);

  return { brandId, deal: pickDealHeader(positions), totalTokens, catalogues };
};
