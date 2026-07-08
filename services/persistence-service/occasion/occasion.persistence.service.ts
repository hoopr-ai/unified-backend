import { Op } from "sequelize";
import {
  OccasionModel,
  TrackOccasionMappingModel,
  type OccasionDetails,
  type TrackOccasionMappingDetails,
} from "./schemas/modules.export";
import { TrackModel } from "../track/schemas/track.schema";
import { TrackArtistMappingModel, ArtistModel } from "../artists/modules.export";
import { SkuModel } from "../sku/modules.export";
import { sequelize } from "../database";

export const saveOccasion = async (
  occasionDetails: OccasionDetails
): Promise<OccasionDetails> => {
  const occasion = await OccasionModel.create(occasionDetails);
  return occasion;
};

export const findAllOccasions = async (): Promise<OccasionDetails[]> => {
  const occasions = await OccasionModel.findAll({
    order: [["end", "ASC"]],
  });
  return occasions;
};

// ─── CMS write-side (create / edit / delete / image upload) ─────────────────

export const findOccasionById = async (
  id: number,
): Promise<OccasionModel | null> => {
  return await OccasionModel.findByPk(id);
};

// True if any occasion already owns this occasionCode (used by the
// code-generation loop to guarantee uniqueness).
export const occasionCodeExists = async (
  occasionCode: string,
): Promise<boolean> => {
  const found = await OccasionModel.findOne({
    where: { occasionCode },
    attributes: ["id"],
  });
  return found != null;
};

export const createOccasion = async (
  attrs: Partial<OccasionDetails>,
): Promise<OccasionModel> => {
  return await OccasionModel.create(attrs as OccasionDetails);
};

export const updateOccasionById = async (
  id: number,
  patch: Partial<OccasionDetails>,
): Promise<OccasionModel | null> => {
  const occasion = await OccasionModel.findByPk(id);
  if (!occasion) return null;
  await occasion.update(patch);
  return occasion;
};

export const deleteOccasionById = async (id: number): Promise<boolean> => {
  const deleted = await OccasionModel.destroy({ where: { id } });
  return deleted > 0;
};

// Single-occasion detail lookup — resolve by occasionCode OR numeric id, for
// the public GET /occasions/:idOrCode endpoint.
export const findOccasionByCodeOrId = async (
  idOrCode: string,
): Promise<OccasionModel | null> => {
  const numericId = /^\d+$/.test(idOrCode) ? Number(idOrCode) : undefined;
  return await OccasionModel.findOne({
    where: {
      [Op.or]:
        numericId != null
          ? [{ occasionCode: idOrCode }, { id: numericId }]
          : [{ occasionCode: idOrCode }],
    },
  });
};

// For rail-item hydration — resolve by occasionCode OR numeric id, mirroring
// hydratePlaylists' playlistCode-or-id lookup.
export const findOccasionsByCodesOrIds = async (
  codes: string[],
): Promise<OccasionModel[]> => {
  if (codes.length === 0) return [];
  const numericIds = codes.filter((c) => /^\d+$/.test(c)).map(Number);
  return await OccasionModel.findAll({
    where: {
      [Op.or]: numericIds.length > 0
        ? [
            { occasionCode: { [Op.in]: codes } },
            { id: { [Op.in]: numericIds } },
          ]
        : [{ occasionCode: { [Op.in]: codes } }],
    },
    attributes: ["id", "occasionCode", "title", "imageLink"],
  });
};

// ─── CMS-managed track attach/detach (independent of the legacy keyword system) ──

export const findOccasionTrackMappings = async (
  occasionId: number,
): Promise<TrackOccasionMappingModel[]> => {
  return await TrackOccasionMappingModel.findAll({
    where: { occasionId },
    order: [["rank", "ASC"]],
    include: [
      {
        model: TrackModel,
        as: "track",
        attributes: [
          "id",
          "trackCode",
          "name",
          "name_slug",
          "sourceLink",
          "waveformLink",
          "mp3Link",
          "hasVocals",
          "trending",
          "ownerId",
          "hookTimings",
        ],
        include: [
          {
            model: TrackArtistMappingModel,
            as: "trackArtistMappings",
            required: false,
            include: [
              {
                model: ArtistModel,
                as: "artist",
                attributes: ["id", "name", "type"],
                required: false,
              },
            ],
          },
          {
            model: SkuModel,
            as: "skus",
            required: false,
            attributes: ["id", "costPrice", "sellingPrice"],
          },
        ],
      },
    ],
  });
};

// Replace the full ordered track set for an occasion. The CMS always sends the
// complete list, so we wipe existing mappings and bulk-insert the new ones in a
// single transaction (mirrors setPlaylistTracks).
export const setOccasionTracks = async (
  occasionId: number,
  tracks: { trackId: string; rank: number }[],
): Promise<void> => {
  const transaction = await sequelize.transaction();
  try {
    await TrackOccasionMappingModel.destroy({ where: { occasionId }, transaction });

    if (tracks.length > 0) {
      await TrackOccasionMappingModel.bulkCreate(
        tracks.map((t) => ({ occasionId, trackId: t.trackId, rank: t.rank })) as unknown as TrackOccasionMappingDetails[],
        { transaction },
      );
    }

    await transaction.commit();
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
};

export const deleteOccasionTrackMappings = async (occasionId: number): Promise<void> => {
  await TrackOccasionMappingModel.destroy({ where: { occasionId } });
};
