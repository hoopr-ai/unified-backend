import { PlaylistModel } from "./schemas/playlist.schema";
import { TrackPlaylistMappingModel } from "./schemas/track-playlist-mapping.schema";
import { TrackModel } from "../track/schemas/track.schema";
import { TrackArtistMappingModel, ArtistModel } from "../artists/modules.export";
import { PlaylistStatus, ArtistType, ArtistInfoTrack, PaginatedPlaylists, GetAllPlaylistsParams, PlaylistInfo } from "../../dto-service/modules.export";

export const findAllPlaylists = async (
  params: GetAllPlaylistsParams,
): Promise<PaginatedPlaylists> => {
  const { page, limit, status } = params;
  const offset = (page - 1) * limit;

  const whereClause: Record<string, unknown> = {};

  if (status) {
    whereClause.status = status;
  } else {
    whereClause.status = PlaylistStatus.ACTIVE;
  }

  const { count, rows } = await PlaylistModel.findAndCountAll({
    where: whereClause,
    attributes: ["id", "playlistCode", "name", "name_slug"],
    order: [["createdAt", "DESC"]],
    limit,
    offset,
  });

  const totalPages = Math.ceil(count / limit);

  const playlists: PlaylistInfo[] = rows.map((playlist) => {
    const playlistData = playlist.toJSON() as PlaylistModel;

    return {
      id: playlistData.id,
      playlistCode: playlistData.playlistCode || null,
      name: playlistData.name || "",
      name_slug: playlistData.name_slug || null,
    };
  });

  return {
    playlists,
    pagination: {
      page,
      limit,
      totalItems: count,
      totalPages,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
    },
  };
};

export interface TrackInfo {
  id: string;
  trackCode: string;
  name: string;
  name_slug: string | null;
  sourceLink: string | null;
  waveformLink: string | null;
  mp3Link: string | null;
  hasVocals: boolean | null;
  trending: boolean | null;
  primaryArtists: ArtistInfoTrack[];
}

export interface PlaylistDetail {
  id: string;
  playlistCode: string | null;
  name: string;
  name_slug: string | null;
  description: string | null;
  tracks: TrackInfo[];
}

export interface GetPlaylistDetailParams {
  playlistCode: string;
}

export const findPlaylistByCode = async (
  params: GetPlaylistDetailParams,
): Promise<PlaylistDetail | null> => {
  const { playlistCode } = params;

  const playlist = await PlaylistModel.findOne({
    where: {
      playlistCode,
      status: PlaylistStatus.ACTIVE,
    },
    attributes: ["id", "playlistCode", "name", "name_slug", "description"],
  });

  if (!playlist) {
    return null;
  }

  const playlistData = playlist.toJSON() as PlaylistModel;

  const mappings = await TrackPlaylistMappingModel.findAll({
    where: { playlistId: playlistData.id },
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

  const tracks: TrackInfo[] = mappings
    .filter((mapping) => {
      if (!mapping.track) {
        console.log(`⚠️ Skipped track with ID: ${mapping.trackId} - not found in tracks table`);
        return false;
      }
      return true;
    })
    .map((mapping) => {
      const trackData = mapping.track!.toJSON() as TrackModel & {
        trackArtistMappings?: Array<{
          isPrimary?: boolean;
          artist?: { id: string; name: string; type: ArtistType[] };
        }>;
      };

      const primaryArtists: ArtistInfoTrack[] = [];

      if (trackData.trackArtistMappings) {
        for (const artistMapping of trackData.trackArtistMappings) {
          if (artistMapping.artist && artistMapping.isPrimary) {
            primaryArtists.push({
              id: artistMapping.artist.id,
              name: artistMapping.artist.name,
              type: artistMapping.artist.type || [],
            });
          }
        }
      }

      return {
        id: trackData.id,
        trackCode: trackData.trackCode,
        name: trackData.name || "",
        name_slug: trackData.name_slug || null,
        sourceLink: trackData.sourceLink || null,
        waveformLink: trackData.waveformLink || null,
        mp3Link: trackData.mp3Link || null,
        hasVocals: trackData.hasVocals || null,
        trending: trackData.trending || null,
        primaryArtists,
      };
    });

  return {
    id: playlistData.id,
    playlistCode: playlistData.playlistCode || null,
    name: playlistData.name || "",
    name_slug: playlistData.name_slug || null,
    description: playlistData.description || null,
    tracks,
  };
};
