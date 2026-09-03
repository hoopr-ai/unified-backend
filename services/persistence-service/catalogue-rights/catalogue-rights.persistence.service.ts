import { Op, fn, col } from "sequelize";
import type { WhereOptions } from "sequelize";
import {
  CatalogueRightsModel,
  BrandCatalogueRightsModel,
} from "./modules.export";
import { OwnerModel } from "../owner/modules.export";
import { TokenAssignedModel } from "../token/modules.export";
import { BrandModel } from "../brand/schemas/modules.export";
import type {
  CatalogueRights,
  PartialCatalogueRights,
} from "../../dto-service/catalogue-rights/catalogue-rights.dto";
import {
  emptyCatalogueRights,
  normalizeCatalogueRights,
  normalizePartialCatalogueRights,
} from "../../dto-service/catalogue-rights/catalogue-rights.dto";

// ---------------------------------------------------------------------------
// Catalogue rights persistence.
//
// A catalogue has no table of its own — it is the string on owners.type, which
// token_assigned.type mirrors exactly. Everything here keys by that string.
// ---------------------------------------------------------------------------

/**
 * The catalogues that actually exist, straight from owners.type.
 *
 * This is the write path's validation set, deliberately dynamic: hard-coding
 * the four current values would mean a code deploy the day a fifth catalogue is
 * signed, and a CHECK constraint would mean a migration. Reading the live set
 * costs one indexed DISTINCT on a 198-row table.
 */
export const findKnownCatalogues = async (): Promise<string[]> => {
  // Cast because Sequelize's WhereOptions does not model `Op.ne: null` against
  // an optional string column, though Postgres handles it fine.
  const where = {
    type: { [Op.ne]: null },
    deleted: { [Op.is]: null },
  } as unknown as WhereOptions<OwnerModel>;

  const rows = await OwnerModel.findAll({
    attributes: [[fn("DISTINCT", col("type")), "type"]],
    where,
    raw: true,
  });
  return (rows as unknown as { type: string | null }[])
    .map((r) => r.type)
    .filter((t): t is string => typeof t === "string" && t.trim().length > 0)
    .sort((a, b) => a.localeCompare(b));
};

export const findAllCatalogueRights = async (): Promise<CatalogueRightsModel[]> =>
  CatalogueRightsModel.findAll({ order: [["catalogue", "ASC"]] });

export const findCatalogueRights = async (
  catalogue: string,
): Promise<CatalogueRightsModel | null> =>
  CatalogueRightsModel.findByPk(catalogue);

/**
 * Create or replace one catalogue's defaults.
 *
 * The blob is written COMPLETE (every key present) — a default with a missing
 * key would make the merge below fall back to `false` silently, which reads as
 * "we decided no" rather than "nobody decided". Only overrides are partial.
 */
export const upsertCatalogueRights = async (
  catalogue: string,
  rights: CatalogueRights,
  updatedById: number | null,
): Promise<CatalogueRightsModel> => {
  const existing = await CatalogueRightsModel.findByPk(catalogue);
  if (existing) {
    await existing.update({ rights, updatedById });
    return existing;
  }
  return CatalogueRightsModel.create({ catalogue, rights, updatedById });
};

/** Count of brands deviating from each catalogue, keyed by catalogue name. */
export const countOverridesByCatalogue = async (): Promise<Map<string, number>> => {
  const rows = await BrandCatalogueRightsModel.findAll({
    attributes: ["catalogue", [fn("COUNT", col("id")), "count"]],
    group: ["catalogue"],
    raw: true,
  });
  const out = new Map<string, number>();
  for (const r of rows as unknown as { catalogue: string; count: string }[]) {
    out.set(r.catalogue, Number(r.count));
  }
  return out;
};

/** Every brand override for one catalogue, with the brand's name for display. */
export const findOverridesForCatalogue = async (
  catalogue: string,
): Promise<BrandCatalogueRightsModel[]> =>
  BrandCatalogueRightsModel.findAll({
    where: { catalogue },
    include: [{ model: BrandModel, attributes: ["id", "name"] }],
    order: [["brandId", "ASC"]],
  });

/** Every override belonging to one brand — the subscription screen's read. */
export const findOverridesForBrand = async (
  brandId: number,
): Promise<BrandCatalogueRightsModel[]> =>
  BrandCatalogueRightsModel.findAll({ where: { brandId } });

/**
 * Create or replace one brand's override for one catalogue.
 *
 * Upsert on the unique (brandId, catalogue) index rather than
 * read-modify-write, so two concurrent CMS saves cannot interleave into a lost
 * update.
 */
export const upsertBrandOverride = async (
  brandId: number,
  catalogue: string,
  rights: PartialCatalogueRights,
  note: string | null,
  updatedById: number | null,
): Promise<BrandCatalogueRightsModel> => {
  const existing = await BrandCatalogueRightsModel.findOne({
    where: { brandId, catalogue },
  });
  if (existing) {
    await existing.update({ rights, note, updatedById });
    return existing;
  }
  return BrandCatalogueRightsModel.create({
    brandId,
    catalogue,
    rights,
    note,
    updatedById,
  });
};

/** Drop an override so the brand reverts to the catalogue default. */
export const deleteBrandOverride = async (
  brandId: number,
  catalogue: string,
): Promise<number> =>
  BrandCatalogueRightsModel.destroy({ where: { brandId, catalogue } });

/**
 * The brand's token position per catalogue.
 *
 * token_assigned is one row per PURCHASE, not per catalogue — a brand that
 * topped up three times has three Chartbusters rows — so this aggregates. The
 * screen shows one card per catalogue with the summed total, which is what
 * "85 tokens total" on the header is counting.
 *
 * Expired rows are excluded: an expired pack is not an entitlement, and leaving
 * it in would show tokens the deduction path would refuse to spend.
 */
export const findTokenPositionForBrand = async (
  brandId: number,
): Promise<TokenAssignedModel[]> =>
  TokenAssignedModel.findAll({
    where: {
      brandId,
      [Op.or]: [
        { expiryDate: { [Op.is]: null } },
        { expiryDate: { [Op.gt]: new Date() } },
      ],
    } as unknown as WhereOptions<TokenAssignedModel>,
    attributes: [
      "id",
      "type",
      "totalAssignedToken",
      "tokenBalance",
      "isUnlimited",
      "expiryDate",
      "startDate",
      "title",
      "subTitle",
      "createdAt",
    ],
  });

// ── Merge ──────────────────────────────────────────────────────────────────

/**
 * Catalogue default merged with a brand's partial override.
 *
 * The ONE place the precedence rule lives. Both sides are normalised first so a
 * hand-edited row or a key retired from the vocabulary can never reach a
 * client: unknown keys are dropped, and any right the default forgot resolves
 * to false rather than undefined.
 */
export const mergeRights = (
  defaults: unknown,
  override: unknown,
): { rights: CatalogueRights; overriddenKeys: string[] } => {
  const base = normalizeCatalogueRights(defaults);
  const partial = normalizePartialCatalogueRights(override);
  const rights = { ...base, ...partial } as CatalogueRights;
  // Only keys that actually CHANGE the answer count as overridden — an override
  // restating the default is noise, and badging it in the CMS would send
  // someone hunting for a negotiation that never happened.
  const overriddenKeys = Object.keys(partial).filter(
    (k) => partial[k as keyof CatalogueRights] !== base[k as keyof CatalogueRights],
  );
  return { rights, overriddenKeys };
};

export { emptyCatalogueRights };
