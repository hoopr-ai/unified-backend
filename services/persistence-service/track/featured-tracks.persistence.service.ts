import { FeaturedTracksModel, FeaturedTracksDetails } from "./schemas/featured-tracks.schema";

export const findFeaturedTracksByPlatform = async (
  platform: string,
): Promise<FeaturedTracksDetails | null> => {
  const featuredTracks = await FeaturedTracksModel.findOne({
    where: { platform },
  });
  return featuredTracks ? (featuredTracks.toJSON() as FeaturedTracksDetails) : null;
};

export const createFeaturedTracks = async (
  platform: string,
  trackCodes: string[],
): Promise<FeaturedTracksDetails> => {
  const featuredTracks = await FeaturedTracksModel.create({
    platform,
    trackCodes,
  });
  return featuredTracks.toJSON() as FeaturedTracksDetails;
};

export const updateFeaturedTracks = async (
  platform: string,
  trackCodes: string[],
): Promise<FeaturedTracksDetails | null> => {
  const [affectedCount] = await FeaturedTracksModel.update(
    { trackCodes },
    { where: { platform } },
  );

  if (affectedCount === 0) {
    return null;
  }

  return findFeaturedTracksByPlatform(platform);
};

export const upsertFeaturedTracks = async (
  platform: string,
  trackCodes: string[],
): Promise<FeaturedTracksDetails> => {
  const existing = await findFeaturedTracksByPlatform(platform);

  if (existing) {
    const updated = await updateFeaturedTracks(platform, trackCodes);
    return updated!;
  }

  return createFeaturedTracks(platform, trackCodes);
};
