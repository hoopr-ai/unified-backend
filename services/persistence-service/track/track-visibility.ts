import { Op } from "sequelize";

/**
 * Owners whose tracks Smash serves even when flagged `isHidden`. Songfest holds
 * the recordings that were pulled from the catalogue (see
 * scripts/assign-hidden-tracks-to-songfest.sql), most still flagged — and the
 * flag is shared with NATIVE-BE, which keeps hiding them. So they are back on
 * Smash only, without touching the flag. Its id is fixed and identical on prod
 * and sage (scripts/create-owner-songfest.sql).
 */
export const SMASH_VISIBLE_HIDDEN_OWNER_IDS: readonly string[] = [
  "5c82779c-d5b8-44c3-9631-f9cac0091a0e", // Songfest
];

/**
 * A track is servable only when it is ACTIVE and either not flagged `isHidden`
 * or owned by one of SMASH_VISIBLE_HIDDEN_OWNER_IDS. NATIVE-BE applies the
 * plain `isHidden` rule.
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
    [Op.and]: [
      ...andList,
      {
        [Op.or]: [
          // IS NOT TRUE, so NULL counts as visible.
          { isHidden: { [Op.not]: true } },
          { ownerId: { [Op.overlap]: SMASH_VISIBLE_HIDDEN_OWNER_IDS as string[] } },
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
  if (track.isHidden !== true) return true;
  return Array.isArray(track.ownerId) && track.ownerId.some((id) => SMASH_VISIBLE_HIDDEN_OWNER_IDS.includes(id));
};
