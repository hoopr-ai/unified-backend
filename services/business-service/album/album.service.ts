import {
  findAlbumsByTypes,
  findAlbumByIdSilently,
  findAllTracksByIds,
  findActiveTrackIdsByIds,
  getRestrictedOwnersByBrandId,
} from "../../persistence-service/exports";
import { getUserLikedTrackCodes } from "../../persistence-service/user/liked-track.persistence.service";
import {
  AlbumDto,
  AlbumTracksResponse,
  GetAlbumsRequestData,
  GetAlbumsResponse,
} from "../../dto-service/modules.export";
import { transformRawTracksToDto } from "../track/track.service";

const parsePaginationParams = (
  pageStr?: string,
  limitStr?: string,
): { page: number; limit: number } => {
  const page = parseInt(pageStr || "1", 10);
  const limit = parseInt(limitStr || "10", 10);
  return {
    page: page > 0 ? page : 1,
    limit: limit > 0 && limit <= 100 ? limit : 10,
  };
};

export const getAllAlbumsService = async (
  query: GetAlbumsRequestData,
  brandId?: number,
): Promise<GetAlbumsResponse> => {
  const { page, limit } = parsePaginationParams(query.page, query.limit);

  const excludeOwnerIds = brandId
    ? await getRestrictedOwnersByBrandId(brandId)
    : undefined;

  const albums = await findAlbumsByTypes(query.type);

  // Collect all unique track IDs across all albums in one batch
  const albumsWithIds = albums.filter(
    (album) => album.trackId && album.trackId.length > 0,
  );

  const allTrackIds = [
    ...new Set(albumsWithIds.flatMap((album) => album.trackId!)),
  ];

  // Single DB query: which IDs are active AND not from restricted owners
  const activeTrackIds = await findActiveTrackIdsByIds(
    allTrackIds,
    excludeOwnerIds,
  );

  const filtered: AlbumDto[] = albumsWithIds
    .map((album) => {
      const activeCount = album.trackId!.filter((id) =>
        activeTrackIds.has(id),
      ).length;
      return { album, activeCount };
    })
    .filter(({ activeCount }) => activeCount > 0)
    .map(({ album, activeCount }) => ({
      id: album.id,
      title: album.title,
      type: album.type as string | undefined,
      trackCount: activeCount,
      createdAt: album.createdAt,
    }));

  const totalItems = filtered.length;
  const totalPages = Math.ceil(totalItems / limit);
  const offset = (page - 1) * limit;

  return {
    albums: filtered.slice(offset, offset + limit),
    pagination: {
      page,
      limit,
      totalItems,
      totalPages,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
    },
  };
};

export const getAlbumTracksService = async (
  albumId: string,
  userId?: number,
  brandId?: number,
): Promise<AlbumTracksResponse | null> => {
  const album = await findAlbumByIdSilently(albumId);

  if (!album) {
    return null;
  }

  if (!album.trackId || album.trackId.length === 0) {
    return { tracks: [], totalCount: 0 };
  }

  const excludeOwnerIds = brandId
    ? await getRestrictedOwnersByBrandId(brandId)
    : undefined;

  let likedTrackCodes: Set<string> | undefined;
  if (userId) {
    const likedCodes = await getUserLikedTrackCodes(userId);
    likedTrackCodes = new Set(likedCodes);
  }

  const rawTracks = await findAllTracksByIds(album.trackId, excludeOwnerIds);
  const tracks = await transformRawTracksToDto(rawTracks, likedTrackCodes);

  return { tracks, totalCount: tracks.length };
};
