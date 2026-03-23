import {
  TrackWithArtists,
  PaginatedTracksResponseData,
} from "../../dto-service/modules.export";
import {
  findFeaturedTracksByPlatform,
  upsertFeaturedTracks,
  findTracksByTrackCodes,
  getRestrictedOwnersByBrandId,
} from "../../persistence-service/exports";
import { getUserLikedTrackCodes } from "../../persistence-service/user/liked-track.persistence.service";
import { transformRawTracksToDto } from "./track.service";

export interface FeaturedTracksResponse {
  platform: string;
  tracks: TrackWithArtists[];
}

// Get featured tracks for a platform with full track details
export const getFeaturedTracksService = async (
  platform: string,
  userId?: number,
  brandId?: number,
): Promise<FeaturedTracksResponse | null> => {
  const featuredTracks = await findFeaturedTracksByPlatform(platform);

  if (!featuredTracks || featuredTracks.trackCodes.length === 0) {
    return null;
  }

  // Get restricted owners for the brand
  const excludeOwnerIds = brandId
    ? await getRestrictedOwnersByBrandId(brandId)
    : undefined;

  // Fetch user's liked track codes if authenticated
  let likedTrackCodes: Set<string> | undefined;
  if (userId) {
    const likedCodes = await getUserLikedTrackCodes(userId);
    likedTrackCodes = new Set(likedCodes);
  }

  // Fetch tracks by track codes with a high limit to get all tracks
  const rawData = await findTracksByTrackCodes(
    featuredTracks.trackCodes,
    1,
    100, // Fetch up to 100 featured tracks
    undefined,
    excludeOwnerIds,
  );

  // Transform raw tracks to DTOs
  const tracks = await transformRawTracksToDto(rawData.rows, likedTrackCodes);

  // Sort tracks in the order of featured trackCodes
  const trackCodeOrder = new Map(
    featuredTracks.trackCodes.map((code, idx) => [code, idx]),
  );
  tracks.sort((a, b) => {
    const orderA = trackCodeOrder.get(a.trackCode) ?? Number.MAX_SAFE_INTEGER;
    const orderB = trackCodeOrder.get(b.trackCode) ?? Number.MAX_SAFE_INTEGER;
    return orderA - orderB;
  });

  return {
    platform: featuredTracks.platform,
    tracks,
  };
};

// Create or update featured tracks for a platform
export const upsertFeaturedTracksService = async (
  platform: string,
  trackCodes: string[],
): Promise<{ platform: string; trackCodes: string[] }> => {
  const result = await upsertFeaturedTracks(platform, trackCodes);
  return {
    platform: result.platform,
    trackCodes: result.trackCodes,
  };
};
