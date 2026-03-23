import { findAllOccasions } from "../../persistence-service/occasion/modules.export";
import { findKeywordIdsByOccasionId, findTracksByKeywordIds } from "../../persistence-service/keyword/modules.export";
import { getRestrictedOwnersByBrandId } from "../../persistence-service/exports";
import { getUserLikedTrackCodes } from "../../persistence-service/user/liked-track.persistence.service";
import { buildTracksResponseFromRawData } from "../track/track.service";
import type { OccasionResponseData } from "../../dto-service/occasion/modules.export";
import type { PaginatedTracksResponseData } from "../../dto-service/modules.export";

export const getOccasionsService = async (): Promise<OccasionResponseData[]> => {
  const occasions = await findAllOccasions();
  return occasions.map((o) => ({
    id: o.id!,
    title: o.title,
    month: o.month,
    date: o.date,
    className: o.className,
    end: o.end,
    createdAt: o.createdAt!,
  }));
};

export const getTracksByOccasionService = async (
  occasionId: number,
  page: number,
  limit: number,
  userId?: number,
  brandId?: number,
): Promise<PaginatedTracksResponseData> => {
  const keywordIds = await findKeywordIdsByOccasionId(occasionId);

  if (keywordIds.length === 0) {
    return {
      tracks: [],
      pagination: { page, limit, totalItems: 0, totalPages: 0, hasNextPage: false, hasPrevPage: false },
    };
  }

  const excludeOwnerIds = brandId ? await getRestrictedOwnersByBrandId(brandId) : undefined;

  let likedTrackCodes: Set<string> | undefined;
  if (userId) {
    const likedCodes = await getUserLikedTrackCodes(userId);
    likedTrackCodes = new Set(likedCodes);
  }

  const rawData = await findTracksByKeywordIds(keywordIds, page, limit, undefined, excludeOwnerIds);
  return buildTracksResponseFromRawData(rawData, likedTrackCodes);
};
