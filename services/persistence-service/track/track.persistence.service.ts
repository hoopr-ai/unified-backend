import { TrackModel } from "./schemas/track.schema";
import {
  TrackArtistMappingModel,
  ArtistModel,
} from "../artists/modules.export";
import { ArtistInfoTrack, ArtistType, GetAllTracksParams, PaginatedTracks, TrackWithArtists } from "../../dto-service/modules.export";

export const findAllTracks = async (
  params: GetAllTracksParams,
): Promise<PaginatedTracks> => {
  const { page, limit, trending } = params;
  const offset = (page - 1) * limit;

  const whereClause: Record<string, unknown> = {};

  if (trending === true) {
    whereClause.trending = true;
  }

  const { count, rows } = await TrackModel.findAndCountAll({
    where: whereClause,
    order: [["createdAt", "DESC"]],
    limit,
    offset,
    distinct: true,
    col: "id",
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
    ],
  });

  const totalPages = Math.ceil(count / limit);

  const tracksWithArtists: TrackWithArtists[] = rows.map((track) => {
    const trackData = track.toJSON() as TrackModel & {
      trackArtistMappings?: Array<{
        isPrimary?: boolean;
        artist?: { id: string; name: string; type: ArtistType[] };
      }>;
    };

    const primaryArtists: ArtistInfoTrack[] = [];

    if (trackData.trackArtistMappings) {
      for (const mapping of trackData.trackArtistMappings) {
        if (mapping.artist && mapping.isPrimary) {
          primaryArtists.push({
            id: mapping.artist.id,
            name: mapping.artist.name,
            type: mapping.artist.type || [],
          });
        }
      }
    }

    return {
      id: trackData.id,
      trackCode: trackData.trackCode,
      name: trackData.name || "",
      name_slug: trackData.name_slug || "",
      sourceLink: trackData.sourceLink || null,
      waveformLink: trackData.waveformLink || null,
      mp3Link: trackData.mp3Link || null,
      hasVocals: trackData.hasVocals || null,
      trending: trackData.trending || null,
      primaryArtists,
    };
  });

  return {
    tracks: tracksWithArtists,
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

export const findTracksByTrackCodes = async (
  trackCodes: string[],
  params: GetAllTracksParams,
): Promise<PaginatedTracks> => {
  if (!trackCodes || trackCodes.length === 0) {
    return {
      tracks: [],
      pagination: {
        page: params.page,
        limit: params.limit,
        totalItems: 0,
        totalPages: 0,
        hasNextPage: false,
        hasPrevPage: false,
      },
    };
  }

  const { page, limit } = params;
  const offset = (page - 1) * limit;

  const { count, rows } = await TrackModel.findAndCountAll({
    where: {
      trackCode: trackCodes,
    },
    order: [["createdAt", "DESC"]],
    limit,
    offset,
    distinct: true,
    col: "id",
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
    ],
  });

  const totalPages = Math.ceil(count / limit);

  const tracksWithArtists: TrackWithArtists[] = rows.map((track) => {
    const trackData = track.toJSON() as TrackModel & {
      trackArtistMappings?: Array<{
        isPrimary?: boolean;
        artist?: { id: string; name: string; type: ArtistType[] };
      }>;
    };

    const primaryArtists: ArtistInfoTrack[] = [];

    if (trackData.trackArtistMappings) {
      for (const mapping of trackData.trackArtistMappings) {
        if (mapping.artist && mapping.isPrimary) {
          primaryArtists.push({
            id: mapping.artist.id,
            name: mapping.artist.name,
            type: mapping.artist.type || [],
          });
        }
      }
    }

    return {
      id: trackData.id,
      trackCode: trackData.trackCode,
      name: trackData.name || "",
      name_slug: trackData.name_slug || "",
      sourceLink: trackData.sourceLink || null,
      waveformLink: trackData.waveformLink || null,
      mp3Link: trackData.mp3Link || null,
      hasVocals: trackData.hasVocals || null,
      trending: trackData.trending || null,
      primaryArtists,
    };
  });

  return {
    tracks: tracksWithArtists,
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
