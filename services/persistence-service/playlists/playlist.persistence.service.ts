import { PlaylistModel, PlaylistDetails } from "./schemas/playlist.schema";
import {
  TrackPlaylistMappingModel,
  TrackPlaylistMappingDetails,
} from "./schemas/track-playlist-mapping.schema";
import { TrackModel } from "../track/schemas/track.schema";
import {
  TrackArtistMappingModel,
  ArtistModel,
} from "../artists/modules.export";
import { PlaylistStatus } from "../../dto-service/modules.export";
import { Op } from "sequelize";
import { sequelize } from "../database";

export interface FindAllPlaylistsParams {
  limit: number;
  offset: number;
  status?: PlaylistStatus;
}

export interface FindAllPlaylistsResult {
  count: number;
  rows: PlaylistModel[];
}

export const findAllPlaylists = async (
  params: FindAllPlaylistsParams,
): Promise<FindAllPlaylistsResult> => {
  const { limit, offset, status } = params;

  const whereClause: Record<string, unknown> = {
    status: status || { [Op.in]: [PlaylistStatus.ACTIVE] },
  };

  const { count, rows } = await PlaylistModel.findAndCountAll({
    where: whereClause,
    attributes: ["id", "playlistCode", "name", "name_slug"],
    order: [["createdAt", "DESC"]],
    limit,
    offset,
  });

  return { count, rows };
};

export const findPlaylistByCode = async (
  playlistCode: string,
): Promise<PlaylistModel | null> => {
  return await PlaylistModel.findOne({
    where: {
      playlistCode,
      status: { [Op.in]: [PlaylistStatus.ACTIVE, PlaylistStatus.HIDDEN] },
    },
    attributes: ["id", "playlistCode", "name", "name_slug", "description"],
  });
};

export const findTracksByPlaylistId = async (
  playlistId: string,
): Promise<TrackPlaylistMappingModel[]> => {
  return await TrackPlaylistMappingModel.findAll({
    where: { playlistId },
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
        ],
        include: [
          {
            model: TrackArtistMappingModel,
            as: "trackArtistMappings",
            include: [
              {
                model: ArtistModel,
                as: "artist",
                attributes: ["id", "name", "type"],
              },
            ],
          },
        ],
      },
    ],
  });
};

export interface SearchPlaylistsByNameParams {
  name: string;
  limit?: number;
}

export interface SearchPlaylistResult {
  id: string;
  playlistCode: string | null;
  name: string;
  name_slug: string | null;
  description: string | null;
}

export const searchPlaylistsByName = async (
  params: SearchPlaylistsByNameParams,
): Promise<SearchPlaylistResult[]> => {
  const { name, limit = 20 } = params;

  const rows = await PlaylistModel.findAll({
    where: {
      name: { [Op.iLike]: `%${name}%` },
      status: { [Op.in]: [PlaylistStatus.ACTIVE, PlaylistStatus.HIDDEN] },
    },
    attributes: ["id", "playlistCode", "name", "name_slug", "description"],
    order: [["name", "ASC"]],
    limit,
  });

  return rows.map((playlist) => ({
    id: playlist.id,
    playlistCode: playlist.playlistCode || null,
    name: playlist.name || "",
    name_slug: playlist.name_slug || null,
    description: playlist.description || null,
  }));
};

// ─── CMS write-side (create / edit / archive / manage tracks) ────────────────

export const findPlaylistById = async (
  id: string,
): Promise<PlaylistModel | null> => {
  return await PlaylistModel.findByPk(id);
};

// True if any playlist already owns this playlistCode (used by the
// code-generation loop to guarantee uniqueness).
export const playlistCodeExists = async (
  playlistCode: string,
): Promise<boolean> => {
  const found = await PlaylistModel.findOne({
    where: { playlistCode },
    attributes: ["id"],
  });
  return found != null;
};

export const createPlaylist = async (
  attrs: Partial<PlaylistDetails>,
): Promise<PlaylistModel> => {
  return await PlaylistModel.create(attrs as PlaylistDetails);
};

export const updatePlaylistById = async (
  id: string,
  patch: Partial<PlaylistDetails>,
): Promise<PlaylistModel | null> => {
  const playlist = await PlaylistModel.findByPk(id);
  if (!playlist) return null;
  await playlist.update(patch);
  return playlist;
};

// Lightweight resolver: map ACTIVE track codes → ids. Returns one entry per
// code that exists (unknown codes are simply absent, letting the caller report
// them). Intentionally avoids findTracksByTrackCodes — that one paginates and
// eager-loads artists/skus/campaigns, which is wasted work here.
export const findTrackIdsByTrackCodes = async (
  trackCodes: string[],
): Promise<{ id: string; trackCode: string }[]> => {
  if (trackCodes.length === 0) return [];
  const rows = await TrackModel.findAll({
    where: { trackCode: { [Op.in]: trackCodes }, status: "ACTIVE" },
    attributes: ["id", "trackCode"],
  });
  return rows.map((t) => {
    const json = t.toJSON() as { id: string; trackCode: string };
    return { id: json.id, trackCode: json.trackCode };
  });
};

// Replace the full ordered track set for a playlist. The CMS always sends the
// complete list, so we wipe existing mappings and bulk-insert the new ones in a
// single transaction (mirrors deleteRailById's destroy-then-write pattern).
export const setPlaylistTracks = async (
  playlistId: string,
  tracks: { trackId: string; rank: number }[],
): Promise<void> => {
  const transaction = await sequelize.transaction();
  try {
    await TrackPlaylistMappingModel.destroy({
      where: { playlistId },
      transaction,
    });

    if (tracks.length > 0) {
      await TrackPlaylistMappingModel.bulkCreate(
        tracks.map((t) => ({
          playlistId,
          trackId: t.trackId,
          rank: t.rank,
        })) as unknown as TrackPlaylistMappingDetails[],
        { transaction },
      );
    }

    await transaction.commit();
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
};
