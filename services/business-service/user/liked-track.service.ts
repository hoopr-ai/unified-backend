import {
  type LikeTrackRequestData,
  type LikedTracksListResponse,
  type LikedTrackWithDetails,
} from "../../dto-service/modules.export";
import {
  likeTrack,
  unlikeTrack,
  getUserLikedTracks,
  isTrackLiked,
  findTrackByTrackCode,
} from "../../persistence-service/exports";
import { AppError } from "../../helper-service/modules.export";
import { ErrorMessages } from "../../dto-service/constants/modules.export";

export const likeTrackService = async (
  userId: number,
  data: LikeTrackRequestData
): Promise<{ trackCode: string; liked: boolean }> => {
  const { trackCode } = data;

  // Verify track exists
  const track = await findTrackByTrackCode(trackCode);
  if (!track) {
    throw new AppError(ErrorMessages.TrackNotFound, 404);
  }

  await likeTrack(userId, trackCode);

  return {
    trackCode,
    liked: true,
  };
};

export const unlikeTrackService = async (
  userId: number,
  trackCode: string
): Promise<{ trackCode: string; liked: boolean }> => {
  // Check if track was liked
  const wasLiked = await isTrackLiked(userId, trackCode);
  if (!wasLiked) {
    throw new AppError("Track was not liked", 400);
  }

  await unlikeTrack(userId, trackCode);

  return {
    trackCode,
    liked: false,
  };
};

export const getLikedTracksService = async (
  userId: number,
  page: number = 1,
  limit: number = 10
): Promise<LikedTracksListResponse> => {
  const validPage = page > 0 ? page : 1;
  const validLimit = limit > 0 && limit <= 100 ? limit : 10;

  const { rows, count } = await getUserLikedTracks(userId, validPage, validLimit);

  const tracks: LikedTrackWithDetails[] = rows.map((likedTrack: any) => ({
    trackCode: likedTrack.trackCode,
    likedAt: likedTrack.createdAt,
    track: likedTrack.track
      ? {
          id: likedTrack.track.id,
          name: likedTrack.track.name,
          duration: likedTrack.track.duration,
          mp3Link: likedTrack.track.mp3Link,
          waveformLink: likedTrack.track.waveformLink,
          artists: likedTrack.track.trackArtistMappings?.map((mapping: any) => ({
            id: mapping.artist?.id,
            name: mapping.artist?.name,
            isPrimary: mapping.isPrimary,
          })),
        }
      : undefined,
  }));

  const totalPages = Math.ceil(count / validLimit);

  return {
    tracks,
    pagination: {
      page: validPage,
      limit: validLimit,
      totalItems: count,
      totalPages,
      hasNextPage: validPage < totalPages,
      hasPrevPage: validPage > 1,
    },
  };
};

export const checkTrackLikedService = async (
  userId: number,
  trackCode: string
): Promise<{ trackCode: string; isLiked: boolean }> => {
  const liked = await isTrackLiked(userId, trackCode);
  return {
    trackCode,
    isLiked: liked,
  };
};
