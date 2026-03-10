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
