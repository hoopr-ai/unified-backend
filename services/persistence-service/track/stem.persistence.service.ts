import { Op, QueryTypes } from "sequelize";
import { sequelize } from "../database";
import { CreatorStemModel } from "./schemas/creator-stem.schema";

/**
 * Every live stem of one track, ordered by type so the picker is stable across
 * requests.
 *
 * `deleted IS NULL` is explicit: the legacy Sequelize model this table came
 * from was `paranoid`, so soft-deleted rows were filtered implicitly there and
 * would otherwise reappear here.
 */
export const findStemsByTrackId = async (
  trackId: string,
): Promise<CreatorStemModel[]> =>
  CreatorStemModel.findAll({
    where: { trackId, deleted: { [Op.is]: null } },
    order: [["stemType", "ASC"]],
  });

/**
 * Stem counts for many tracks in ONE query, keyed by track id.
 *
 * This runs on every track-list response, so it is deliberately a single
 * grouped scan rather than the per-row lookup `fetchAlbumsForTracks` does —
 * a 50-track rail would otherwise cost 50 extra round trips.
 *
 * Tracks with no stems are simply absent from the map; callers treat a missing
 * key as 0. Most of the catalogue has none.
 */
export const countStemsByTrackIds = async (
  trackIds: string[],
): Promise<Map<string, number>> => {
  const counts = new Map<string, number>();
  if (trackIds.length === 0) return counts;

  // De-duplicated because a rail can legitimately list the same track twice.
  const uniqueIds = [...new Set(trackIds)];

  const rows = await sequelize.query<{ track_id: string; count: number }>(
    `SELECT track_id, COUNT(*)::int AS count
       FROM creator_stems
      WHERE deleted IS NULL
        AND track_id IN (:trackIds)
      GROUP BY track_id`,
    { replacements: { trackIds: uniqueIds }, type: QueryTypes.SELECT },
  );

  for (const row of rows) {
    counts.set(row.track_id, Number(row.count));
  }
  return counts;
};
