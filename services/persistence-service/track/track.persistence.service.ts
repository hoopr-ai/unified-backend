import { TrackModel } from "./schemas/track.schema";
import {
  TrackArtistMappingModel,
  ArtistModel,
} from "../artists/modules.export";
import {
  ArtistInfoTrack,
  ArtistType,
  PaginatedRawTracks,
  PaginatedTracks,
  RawTrackWithMappings,
  TrackWithArtists,
} from "../../dto-service/modules.export";
import { TrackFilterMappingModel } from "../exports";

// Reusable include configuration for artist mappings
const getArtistInclude = () => [
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
];

export const findAllTracks = async (
  page: number,
  limit: number,
  whereClause: Record<string, unknown> = {},
): Promise<PaginatedRawTracks> => {
  const offset = (page - 1) * limit;

  const { count, rows } = await TrackModel.findAndCountAll({
    where: whereClause,
    order: [["createdAt", "DESC"]],
    limit,
    offset,
    distinct: true,
    col: "id",
    include: getArtistInclude(),
  });

  return {
    rows: rows.map((track) => track.toJSON() as RawTrackWithMappings),
    count,
    page,
    limit,
  };
};

export const findTracksByTrackCodes = async (
  trackCodes: string[],
  page: number,
  limit: number,
): Promise<PaginatedRawTracks> => {
  const offset = (page - 1) * limit;

  const { count, rows } = await TrackModel.findAndCountAll({
    where: { trackCode: trackCodes },
    order: [["createdAt", "DESC"]],
    limit,
    offset,
    distinct: true,
    col: "id",
    include: getArtistInclude(),
  });

  const tracksMap = rows.map((track) => track.toJSON() as RawTrackWithMappings);

  // Sort tracks in the same order as the requested trackCodes
  const orderedTracks = trackCodes
    .map((code) => tracksMap.find((track) => track.trackCode === code))
    .filter((track): track is RawTrackWithMappings => track !== undefined);

  return {
    rows: orderedTracks,
    count,
    page,
    limit,
  };
};

export interface GetTracksByFilterParams {
  filterId: string;
  page: number;
  limit: number;
}

export const findTracksByFilter = async (
  params: GetTracksByFilterParams,
): Promise<PaginatedTracks> => {
  const { filterId, page, limit } = params;
  const offset = (page - 1) * limit;

  const { count, rows: mappings } =
    await TrackFilterMappingModel.findAndCountAll({
      where: { filterId },
      limit,
      offset,
      include: [
        {
          model: TrackModel,
          as: "track",
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
        },
      ],
    });

  const tracks: TrackWithArtists[] = mappings
    .filter((mapping) => {
      if (!mapping.track) {
        console.log(
          `⚠️ Skipped track with ID: ${mapping.trackId} - not found in tracks table`,
        );
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
        name_slug: trackData.name_slug || "",
        sourceLink: trackData.sourceLink || null,
        waveformLink: trackData.waveformLink || null,
        mp3Link: trackData.mp3Link || null,
        hasVocals: trackData.hasVocals || null,
        trending: trackData.trending || null,
        primaryArtists,
      };
    });

  const totalPages = Math.ceil(count / limit);

  return {
    tracks,
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
