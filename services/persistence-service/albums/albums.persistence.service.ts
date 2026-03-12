import { ErrorMessages } from "../../dto-service/constants/modules.export";
import type { AlbumType } from "../../dto-service/modules.export";
import { AppError } from "../../helper-service/AppError";
import { AlbumModel, type AlbumDetails } from "./schemas/modules.export";
import { Op } from "sequelize";

export const createAlbum = async (
  albumDetails: AlbumDetails
): Promise<AlbumDetails> => {
  const album = await AlbumModel.create(albumDetails);
  return album;
};

export const findAlbumById = async (id: string): Promise<AlbumDetails> => {
  const album = await AlbumModel.findOne({
    where: { id, deleted: null },
  });
  if (!album) {
    throw new AppError(ErrorMessages.AlbumNotFound, 404);
  }
  return album;
};

export const findAlbumByIdSilently = async (
  id: string
): Promise<AlbumDetails | null> => {
  const album = await AlbumModel.findOne({
    where: { id, deleted: null },
  });
  return album;
};

export const findAlbumsByType = async (
  type: AlbumType
): Promise<AlbumDetails[]> => {
  const albums = await AlbumModel.findAll({
    where: { type, deleted: null },
    order: [["createdAt", "DESC"]],
  });
  return albums;
};

export const findAllAlbums = async (): Promise<AlbumDetails[]> => {
  const albums = await AlbumModel.findAll({
    where: { deleted: null },
    order: [["createdAt", "DESC"]],
  });
  return albums;
};

export const updateAlbum = async (
  id: string,
  updates: Partial<Pick<AlbumDetails, "title" | "type">>
): Promise<AlbumDetails> => {
  const album = await findAlbumById(id);
  await AlbumModel.update(updates, { where: { id } });
  return { ...album, ...updates } as AlbumDetails;
};

export const softDeleteAlbum = async (id: string): Promise<void> => {
  await findAlbumById(id);
  await AlbumModel.update({ deleted: new Date() }, { where: { id } });
};

export const hardDeleteAlbum = async (id: string): Promise<void> => {
  await AlbumModel.destroy({ where: { id } });
};

export const findAlbumByTrackId = async (
  trackId: string
): Promise<AlbumDetails | null> => {
  const album = await AlbumModel.findOne({
    where: {
      trackId: { [Op.contains]: [trackId] },
      deleted: null,
    },
  });
  return album;
};
