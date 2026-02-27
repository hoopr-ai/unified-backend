import {
  findAllPlaylists,
  findPlaylistByCode,
  findTracksByPlaylistId,
} from "../../persistence-service/exports";
import { TrackModel } from "../../persistence-service/track/schemas/track.schema";
import { OwnerModel } from "../../persistence-service/owner/modules.export";
import { Op } from "sequelize";
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

  const validMappings = mappings.filter((mapping) => {
    if (!mapping.track) {
      console.warn(
        `Skipped track with ID: ${mapping.trackId} - not found in tracks table`,
      );
      return false;
    }
    return true;
  });

  // Collect all ownerIds from tracks and fetch owner type/subType
  const allOwnerIds: string[] = [];
  validMappings.forEach((mapping) => {
    const trackData = mapping.track!.toJSON() as any;
    if (trackData.ownerId && Array.isArray(trackData.ownerId)) {
      allOwnerIds.push(...trackData.ownerId);
    }
  });

  const ownerTypeMap = new Map<string, string>();
  const ownerSubTypeMap = new Map<string, string>();
  const uniqueOwnerIds = [...new Set(allOwnerIds)];
  if (uniqueOwnerIds.length > 0) {
    const owners = await OwnerModel.findAll({
      where: { id: { [Op.in]: uniqueOwnerIds } },
      attributes: ["id", "type", "subType"],
    });
    owners.forEach((owner) => {
      if (owner.type) ownerTypeMap.set(owner.id, owner.type);
      if (owner.subType) ownerSubTypeMap.set(owner.id, owner.subType);
    });
  }

  const tracks: PlaylistTrackInfo[] = validMappings.map((mapping) => {
    const trackData = mapping.track!.toJSON() as TrackModel & {
      ownerId?: string[];
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

    let ownerType: string | undefined;
    let ownerSubType: string | undefined;
    if (trackData.ownerId && Array.isArray(trackData.ownerId)) {
      for (const oid of trackData.ownerId) {
        if (!ownerType && ownerTypeMap.get(oid)) ownerType = ownerTypeMap.get(oid);
        if (!ownerSubType && ownerSubTypeMap.get(oid)) ownerSubType = ownerSubTypeMap.get(oid);
        if (ownerType && ownerSubType) break;
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
      ...(ownerType && { ownerType }),
      ...(ownerSubType && { ownerSubType }),
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
