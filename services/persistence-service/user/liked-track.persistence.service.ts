import { UserLikedTrackModel, type UserLikedTrackDetails } from "./schemas/modules.export";
import { TrackModel } from "../track/schemas/track.schema";
import { TrackArtistMappingModel } from "../artists/schemas/track-artist-mapping.schema";
import { ArtistModel } from "../artists/schemas/artist.schema";

export const likeTrack = async (
  userId: number,
  trackCode: string
): Promise<UserLikedTrackDetails> => {
  const [likedTrack] = await UserLikedTrackModel.findOrCreate({
    where: { userId, trackCode },
    defaults: { userId, trackCode },
  });
  return likedTrack;
};

export const unlikeTrack = async (
  userId: number,
  trackCode: string
): Promise<boolean> => {
  const deletedCount = await UserLikedTrackModel.destroy({
    where: { userId, trackCode },
  });
  return deletedCount > 0;
};

export const isTrackLiked = async (
  userId: number,
  trackCode: string
): Promise<boolean> => {
  const likedTrack = await UserLikedTrackModel.findOne({
    where: { userId, trackCode },
  });
  return !!likedTrack;
};

export const getUserLikedTracks = async (
  userId: number,
  page: number,
  limit: number
): Promise<{ rows: UserLikedTrackDetails[]; count: number }> => {
  const offset = (page - 1) * limit;
  const { rows, count } = await UserLikedTrackModel.findAndCountAll({
    where: { userId },
    limit,
    offset,
    order: [["createdAt", "DESC"]],
    include: [
      {
        model: TrackModel,
        as: "track",
        required: false,
        include: [
          {
            model: TrackArtistMappingModel,
            as: "trackArtistMappings",
            required: false,
            include: [
              {
                model: ArtistModel,
                as: "artist",
                required: false,
              },
            ],
          },
        ],
      },
    ],
  });
  return { rows: rows as UserLikedTrackDetails[], count };
};

export const getUserLikedTrackCodes = async (
  userId: number
): Promise<string[]> => {
  const likedTracks = await UserLikedTrackModel.findAll({
    where: { userId },
    attributes: ["trackCode"],
  });
  return likedTracks.map((lt) => lt.trackCode);
};
