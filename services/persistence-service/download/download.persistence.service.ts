import { DownloadModel, type DownloadDetails } from "./schemas/modules.export";
import { TrackModel } from "../track/schemas/modules.export";
import { UserModel } from "../user/schemas/modules.export";

export const createDownloadRecord = async (
  downloadDetails: DownloadDetails
): Promise<DownloadDetails> => {
  const download = await DownloadModel.create(downloadDetails);
  return download;
};

export const getDownloadsByUserId = async (
  userId: number,
  page: number = 1,
  limit: number = 50
): Promise<{ rows: DownloadModel[]; count: number }> => {
  const offset = (page - 1) * limit;
  const { rows, count } = await DownloadModel.findAndCountAll({
    where: { userId },
    include: [
      {
        model: TrackModel,
        attributes: ["id", "trackCode", "name", "sourceLink"],
      },
    ],
    order: [["downloadedAt", "DESC"]],
    limit,
    offset,
  });
  return { rows, count };
};

export const getDownloadsByBrandId = async (
  brandId: number,
  page: number = 1,
  limit: number = 50
): Promise<{ rows: DownloadModel[]; count: number }> => {
  const offset = (page - 1) * limit;
  const { rows, count } = await DownloadModel.findAndCountAll({
    where: { brandId },
    include: [
      {
        model: TrackModel,
        attributes: ["id", "trackCode", "name", "sourceLink"],
      },
      {
        model: UserModel,
        attributes: ["id", "email", "firstName", "lastName"],
      },
    ],
    order: [["downloadedAt", "DESC"]],
    limit,
    offset,
  });
  return { rows, count };
};

export const getDownloadCountByTrackId = async (
  trackId: string
): Promise<number> => {
  const count = await DownloadModel.count({
    where: { trackId },
  });
  return count;
};

export const getTotalDownloadsByBrandId = async (
  brandId: number
): Promise<number> => {
  const count = await DownloadModel.count({
    where: { brandId },
  });
  return count;
};

export const getTotalDownloadsByUserId = async (
  userId: number
): Promise<number> => {
  const count = await DownloadModel.count({
    where: { userId },
  });
  return count;
};
