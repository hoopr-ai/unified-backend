import { TrackModel } from "./schemas/track.schema";
import {
  TrackArtistMappingModel,
  ArtistModel,
} from "../artists/modules.export";
import { ArtistType } from "../../dto-service/modules.export";

export interface ArtistInfo {
  id: string;
  name: string;
  type: ArtistType[];
}

export interface TrackWithArtists {
  id: string;
  trackCode: string;
  name: string;
  name_slug: string;
  sourceLink: string | null;
  waveformLink: string | null;
  mp3Link: string | null;
  hasVocals: boolean | null;
  trending: boolean | null;
  primaryArtists: ArtistInfo[];
}

export interface PaginatedTracks {
  tracks: TrackWithArtists[];
  pagination: {
    page: number;
    limit: number;
    totalItems: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
}

export interface GetAllTracksParams {
  page: number;
  limit: number;
  trending?: boolean;
}

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
  });

  const totalPages = Math.ceil(count / limit);

  const tracksWithArtists: TrackWithArtists[] = rows.map((track) => {
    const trackData = track.toJSON() as TrackModel & {
      trackArtistMappings?: Array<{
        isPrimary?: boolean;
        artist?: { id: string; name: string; type: ArtistType[] };
      }>;
    };

    const primaryArtists: ArtistInfo[] = [];

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
