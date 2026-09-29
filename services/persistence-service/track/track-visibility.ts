import { Op } from "sequelize";

/**
 * Owners whose tracks are never served on catalogue surfaces, whatever their
 * `isHidden` flag says. Songfest holds the recordings that were pulled from the
 * catalogue (see scripts/assign-hidden-tracks-to-songfest.sql); its id is fixed
 * and identical on prod and sage (scripts/create-owner-songfest.sql).
 */
export const HIDDEN_TRACK_OWNER_IDS: readonly string[] = [
  "5c82779c-d5b8-44c3-9631-f9cac0091a0e", // Songfest
];

/**
 * A track is servable only when it is ACTIVE, not flagged `isHidden`, and not
 * owned by a hidden owner. NATIVE-BE applies the same `isHidden` rule.
 *
 * Returns a copy of `where` with those conditions added. An existing
 * `[Op.and]` (array or object) is kept and extended, never overwritten, so
 * call this on the FINAL where clause, right before the query.
 */
export const visibleTrackWhere = <T extends Record<string | symbol, any>>(where: T = {} as T): T => {
  const existingAnd = (where as any)[Op.and];
  const andList = existingAnd === undefined ? [] : Array.isArray(existingAnd) ? existingAnd : [existingAnd];
  return {
    ...where,
    status: "ACTIVE",
    // IS NOT TRUE, so NULL counts as visible.
    isHidden: { [Op.not]: true },
    [Op.and]: [
      ...andList,
      {
        [Op.or]: [
          { ownerId: null },
          { [Op.not]: { ownerId: { [Op.overlap]: HIDDEN_TRACK_OWNER_IDS as string[] } } },
        ],
      },
    ],
  };
};

/** In-memory twin of visibleTrackWhere, for tracks loaded through a join. */
export const isTrackVisible = (track: {
  status?: string | null;
  isHidden?: boolean | null;
  ownerId?: string[] | null;
} | null | undefined): boolean => {
  if (!track) return false;
  if (track.status !== "ACTIVE") return false;
  if (track.isHidden === true) return false;
  if (Array.isArray(track.ownerId) && track.ownerId.some((id) => HIDDEN_TRACK_OWNER_IDS.includes(id))) {
    return false;
  }
  return true;
};
