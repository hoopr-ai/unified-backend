import { TrackModel } from "./schemas/track.schema";
import {
  TrackArtistMappingModel,
  ArtistModel,
} from "../artists/modules.export";
import { ArtistType } from "../../dto-service/modules.export";

// Raw track data type from database
export interface RawTrackWithMappings {
  id: string;
  trackCode: string;
  name: string | null;
  name_slug: string | null;
  sourceLink: string | null;
  waveformLink: string | null;
  mp3Link: string | null;
  hasVocals: boolean | null;
  trending: boolean | null;
  trackArtistMappings?: Array<{
    isPrimary?: boolean;
    artist?: { id: string; name: string; type: ArtistType[] };
  }>;
}

export interface PaginatedRawTracks {
  rows: RawTrackWithMappings[];
  count: number;
  page: number;
  limit: number;
}

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

  return {
    rows: rows.map((track) => track.toJSON() as RawTrackWithMappings),
    count,
    page,
    limit,
  };
};
