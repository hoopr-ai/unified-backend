import { UserStreamHistoryModel, UserStreamHistoryDetails } from "./schemas/user-stream-history.schema";
import { TrackModel } from "../track/schemas/track.schema";
import { TrackArtistMappingModel } from "../artists/schemas/track-artist-mapping.schema";
import { ArtistModel } from "../artists/schemas/artist.schema";
import { SkuModel } from "../sku/modules.export";
import { StreamType } from "../../dto-service/modules.export";

export interface PaginatedStreamHistory {
  rows: UserStreamHistoryModel[];
  count: number;
  page: number;
  limit: number;
}

export const recordStream = async (
  userId: number | undefined,
  trackCode: string,
  streamType: StreamType,
  platform?: string,
): Promise<UserStreamHistoryDetails> => {
  const now = new Date();

  // Find existing record for this user + track + streamType
  const existing = await UserStreamHistoryModel.findOne({
    where: { userId, trackCode, streamType },
  });

  if (existing) {
    // Already exists — just increment count and update lastStreamedAt
    await existing.increment("count");
    await existing.update({ lastStreamedAt: now });
    return existing.reload().then((r) => r.toJSON() as UserStreamHistoryDetails);
  }

  // First time — create new record with count = 1
  const record = await UserStreamHistoryModel.create({
    userId,
    trackCode,
    streamType,
    platform,
    count: 1,
    lastStreamedAt: now,
  });

  return record.toJSON() as UserStreamHistoryDetails;
};

export const getUserStreamHistory = async (
  userId: number,
  page: number,
  limit: number,
): Promise<PaginatedStreamHistory> => {
  const offset = (page - 1) * limit;

  const { count, rows } = await UserStreamHistoryModel.findAndCountAll({
    where: { userId },
    order: [["lastStreamedAt", "DESC"]],
    limit,
    offset,
    distinct: true,
    col: "id",
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
                attributes: ["id", "name", "type"],
                required: false,
              },
            ],
          },
          {
            model: SkuModel,
            as: "skus",
            required: false,
            attributes: ["id", "costPrice", "sellingPrice"],
          },
        ],
      },
    ],
  });

  return { rows, count, page, limit };
};
