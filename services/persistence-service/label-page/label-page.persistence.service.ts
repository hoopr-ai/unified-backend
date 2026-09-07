import { Op } from "sequelize";
import { LabelPageModel, type LabelPageDetails } from "./schemas/modules.export";

export const findAllLabelPages = async (
  activeOnly = false,
): Promise<LabelPageModel[]> => {
  return await LabelPageModel.findAll({
    where: activeOnly ? { isActive: true } : undefined,
    order: [["title", "ASC"]],
  });
};

export const findLabelPageById = async (
  id: number,
): Promise<LabelPageModel | null> => {
  return await LabelPageModel.findByPk(id);
};

export const findLabelPageByOwnerCode = async (
  ownerCode: string,
): Promise<LabelPageModel | null> => {
  return await LabelPageModel.findOne({ where: { ownerCode } });
};

/**
 * Resolve a page from the storefront URL segment or the numeric id — the same
 * idOrCode convenience the web-banner read-side offers.
 */
export const findLabelPageBySlugOrId = async (
  idOrSlug: string,
): Promise<LabelPageModel | null> => {
  const numericId = /^\d+$/.test(idOrSlug) ? Number(idOrSlug) : undefined;
  return await LabelPageModel.findOne({
    where: {
      [Op.or]:
        numericId != null
          ? [{ slug: idOrSlug }, { id: numericId }]
          : [{ slug: idOrSlug }],
    },
  });
};

export const labelPageSlugExists = async (
  slug: string,
): Promise<boolean> => {
  const found = await LabelPageModel.findOne({
    where: { slug },
    attributes: ["id"],
  });
  return found != null;
};

export const labelPageOwnerExists = async (
  ownerId: string,
): Promise<boolean> => {
  const found = await LabelPageModel.findOne({
    where: { ownerId },
    attributes: ["id"],
  });
  return found != null;
};

/**
 * Owner codes that currently have an ACTIVE page. The rails write-path calls
 * this to decide whether a `LABEL_<code>` pageName is a real page, so it runs
 * on every rail create/reorder/copy — hence the two-column projection.
 */
export const findActiveLabelPageOwnerCodes = async (): Promise<string[]> => {
  const rows = await LabelPageModel.findAll({
    where: { isActive: true },
    attributes: ["ownerCode"],
  });
  return rows.map((row) => row.ownerCode);
};

export const createLabelPage = async (
  attrs: Partial<LabelPageDetails>,
): Promise<LabelPageModel> => {
  return await LabelPageModel.create(attrs as LabelPageDetails);
};

export const updateLabelPageById = async (
  id: number,
  patch: Partial<LabelPageDetails>,
): Promise<LabelPageModel | null> => {
  const page = await LabelPageModel.findByPk(id);
  if (!page) return null;
  await page.update(patch);
  return page;
};

export const deleteLabelPageById = async (id: number): Promise<boolean> => {
  const deleted = await LabelPageModel.destroy({ where: { id } });
  return deleted > 0;
};
