import { Op } from "sequelize";
import { WebBannerModel, type WebBannerDetails } from "./schemas/modules.export";

export const findAllWebBanners = async (
  activeOnly = false,
): Promise<WebBannerModel[]> => {
  return await WebBannerModel.findAll({
    where: activeOnly ? { isActive: true } : undefined,
    order: [["id", "ASC"]],
  });
};

export const findWebBannerById = async (
  id: number,
): Promise<WebBannerModel | null> => {
  return await WebBannerModel.findByPk(id);
};

export const webBannerCodeExists = async (
  bannerCode: string,
): Promise<boolean> => {
  const found = await WebBannerModel.findOne({
    where: { bannerCode },
    attributes: ["id"],
  });
  return found != null;
};

export const createWebBanner = async (
  attrs: Partial<WebBannerDetails>,
): Promise<WebBannerModel> => {
  return await WebBannerModel.create(attrs as WebBannerDetails);
};

export const updateWebBannerById = async (
  id: number,
  patch: Partial<WebBannerDetails>,
): Promise<WebBannerModel | null> => {
  const banner = await WebBannerModel.findByPk(id);
  if (!banner) return null;
  await banner.update(patch);
  return banner;
};

export const deleteWebBannerById = async (id: number): Promise<boolean> => {
  const deleted = await WebBannerModel.destroy({ where: { id } });
  return deleted > 0;
};

export const findWebBannerByCodeOrId = async (
  idOrCode: string,
): Promise<WebBannerModel | null> => {
  const numericId = /^\d+$/.test(idOrCode) ? Number(idOrCode) : undefined;
  return await WebBannerModel.findOne({
    where: {
      [Op.or]:
        numericId != null
          ? [{ bannerCode: idOrCode }, { id: numericId }]
          : [{ bannerCode: idOrCode }],
    },
  });
};
