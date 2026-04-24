import { PlaylistModel } from "./schemas/playlist.schema";
import { TrackPlaylistMappingModel } from "./schemas/track-playlist-mapping.schema";
import { TrackModel } from "../track/schemas/track.schema";
import {
  TrackArtistMappingModel,
  ArtistModel,
} from "../artists/modules.export";
import { PlaylistStatus } from "../../dto-service/modules.export";
import { Op } from "sequelize";

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
