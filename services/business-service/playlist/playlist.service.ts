import {
  findAllPlaylists,
  findPlaylistByCode,
  findTracksByPlaylistId,
} from "../../persistence-service/exports";
import { TrackModel } from "../../persistence-service/track/schemas/track.schema";
import {
  ArtistInfoTrack,
  ArtistType,
  GetAllPlaylistsQuery,
  GetPlaylistDetailQuery,
  PaginatedPlaylists,
  PlaylistDetail,
  PlaylistInfo,
  PlaylistStatus,
  PlaylistTrackInfo,
} from "../../dto-service/modules.export";

const buildPaginationResponse = (
  page: number,
  limit: number,
  totalItems: number,
) => {
  const totalPages = Math.ceil(totalItems / limit);
  return {
    page,
    limit,
    totalItems,
    totalPages,
    hasNextPage: page < totalPages,
    hasPrevPage: page > 1,
  };
};

export const getAllPlaylistsService = async (
  query: GetAllPlaylistsQuery,
): Promise<PaginatedPlaylists> => {
  const page = parseInt(query.page || "1", 10);
  const limit = parseInt(query.limit || "10", 10);

  const status = Object.values(PlaylistStatus).includes(query.status as PlaylistStatus)
    ? (query.status as PlaylistStatus)
    : undefined;

  const validPage = page > 0 ? page : 1;
  const validLimit = limit > 0 && limit <= 100 ? limit : 10;
  const offset = (validPage - 1) * validLimit;

  const { count, rows } = await findAllPlaylists({
    limit: validLimit,
    offset,
    status,
  });

  const playlists: PlaylistInfo[] = rows.map((playlist) => ({
    id: playlist.id,
    playlistCode: playlist.playlistCode || null,
    name: playlist.name || "",
    name_slug: playlist.name_slug || null,
  }));

  return {
    playlists,
    pagination: buildPaginationResponse(validPage, validLimit, count),
  };
};

export const getPlaylistDetailService = async (
  query: GetPlaylistDetailQuery,
): Promise<PlaylistDetail | null> => {
  const playlist = await findPlaylistByCode(query.playlistCode);

  if (!playlist) {
    return null;
  }

  const mappings = await findTracksByPlaylistId(playlist.id);

  const tracks: PlaylistTrackInfo[] = mappings
    .filter((mapping) => {
      if (!mapping.track) {
        console.warn(
          `Skipped track with ID: ${mapping.trackId} - not found in tracks table`,
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
    id: playlist.id,
    playlistCode: playlist.playlistCode || null,
    name: playlist.name || "",
    name_slug: playlist.name_slug || null,
    description: playlist.description || null,
    tracks,
  };

};
