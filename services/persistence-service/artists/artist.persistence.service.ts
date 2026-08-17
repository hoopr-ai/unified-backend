import { QueryTypes } from "sequelize";
import { sequelize } from "../database";

// ---------------------------------------------------------------------------
// artists."nativeArtist" — the one place the flag is computed.
//
// A "native artist" is an artist of the Creator platform: the PRIMARY credit on
// at least one ACTIVE, non-SFX track owned by a 'Hoopr Originals' owner. That
// is character-for-character the gate NATIVE-BE applies when it decides who
// appears in its artist directory (ArtistsService.ELIGIBLE_CTE), which is the
// point — the column is a cached mirror of that query, so the two can be
// compared and can never quietly drift into two different definitions.
//
// Two details carried over from that CTE deliberately:
//   · PRIMARY is read two ways, the `isPrimary` flag on older mapping rows and
//     the explicit role on newer ones. Reading only one drops a chunk of the
//     roster.
//   · SFX tracks are excluded — they are credited to bulk contributors who
//     would otherwise flood the flag.
//
// Two modes, because the two callers want different things:
//   · "promote"  — the nightly cron. Looks ONLY at artists that are not flagged
//                  yet and can only turn the flag on. One statement, one pass.
//   · "full"     — the backfill and the admin button. Both directions, so an
//                  artist whose last Originals track was delisted loses it.
// ---------------------------------------------------------------------------

export type NativeArtistRecomputeMode = "promote" | "full";

export interface NativeArtistRecomputeResult {
  mode: NativeArtistRecomputeMode;
  /** Rows flipped false → true. */
  promoted: number;
  /** Rows flipped true → false. Always 0 in "promote" mode. */
  demoted: number;
  /** Artists carrying the flag after the run — "full" mode only. */
  nativeTotal?: number;
  /** Wall time of the write, for the cron log. */
  durationMs: number;
}

/** Owner-type check, case/space-insensitive — same as every other Originals gate. */
const ORIGINALS_OWNERS_SQL = `
  SELECT id FROM owners WHERE LOWER(TRIM(type)) = 'hoopr originals'`;

/**
 * The qualifying condition, as an AND-fragment over `m` (track_artist_mappings)
 * and `t` (tracks). Written once so promote and full cannot diverge.
 */
const QUALIFIES_SQL = `
       t.status = 'ACTIVE'
   AND COALESCE(t."ownerId" && ARRAY(${ORIGINALS_OWNERS_SQL})::uuid[], false)
   AND LOWER(COALESCE(t.type, '')) <> 'sfx'
   AND (m."isPrimary" = true OR UPPER(COALESCE(m.role::text, '')) = 'PRIMARY')`;

/**
 * Ceiling on a recompute statement, and the reason it is set at all: the pool
 * applies statement_timeout=15s to every connection, which is right for a
 * request but would kill a legitimate full recompute halfway through. This
 * raises it to a minute for this transaction only — still a hard stop, so a
 * plan that degrades as the catalogue grows dies and retries next run instead
 * of sitting on the table.
 */
const RECOMPUTE_TIMEOUT_MS = 60_000;

/** Refuses to run when the Originals owner is missing — see recompute(). */
const assertOriginalsOwnerExists = async (): Promise<void> => {
  const owners = await sequelize.query<{ id: string }>(ORIGINALS_OWNERS_SQL, {
    type: QueryTypes.SELECT,
  });
  if (!owners.length) {
    throw new Error(
      "No owner with type 'Hoopr Originals' — refusing to recompute nativeArtist.",
    );
  }
};

/**
 * Recompute artists."nativeArtist".
 *
 * Writes only the rows whose value actually changes, and leaves `updatedAt`
 * alone: the migration scripts do incremental work keyed on that timestamp, and
 * a flag refresh is not an edit to the artist.
 *
 * Throws when no 'Hoopr Originals' owner exists. NATIVE-BE reads that same
 * condition as "nothing qualifies", but here it would mean clearing the flag off
 * every artist in one statement — far more likely a misconfigured DB than a
 * catalogue that genuinely lost its Originals owner, so it refuses instead.
 */
export const recomputeNativeArtistFlags = async (
  mode: NativeArtistRecomputeMode = "full",
): Promise<NativeArtistRecomputeResult> => {
  await assertOriginalsOwnerExists();

  const startedAt = Date.now();
  const transaction = await sequelize.transaction();
  try {
    // LOCAL — reverts with the transaction, so the timeout never leaks onto the
    // next query that borrows this pooled connection.
    await sequelize.query(`SET LOCAL statement_timeout = ${RECOMPUTE_TIMEOUT_MS}`, {
      transaction,
    });

    const changed =
      mode === "promote"
        ? await promoteOnly(transaction)
        : await recomputeBoth(transaction);

    await transaction.commit();
    return { ...changed, mode, durationMs: Date.now() - startedAt };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};

/**
 * Nightly path. `a."nativeArtist" = false` sits inside the CTE, not just on the
 * UPDATE, so the join starts from the few thousand unflagged artists instead of
 * scanning every credit in the catalogue and throwing the result away — the
 * flag is monotone in practice (an artist's first Originals release is the only
 * event that matters), so the flagged rows have nothing left to tell us.
 */
const promoteOnly = async (
  transaction: Awaited<ReturnType<typeof sequelize.transaction>>,
): Promise<{ promoted: number; demoted: number }> => {
  const rows = await sequelize.query<{ id: string }>(
    `WITH eligible AS (
       SELECT DISTINCT m."artistId" AS id
         FROM track_artist_mappings m
         JOIN tracks t   ON t.id = m."trackId"
         JOIN artists ar ON ar.id = m."artistId"
        WHERE ar."nativeArtist" = false
          AND ${QUALIFIES_SQL}
     )
     UPDATE artists a
        SET "nativeArtist" = true
       FROM eligible e
      WHERE a.id = e.id
        AND a."nativeArtist" = false
  RETURNING a.id`,
    { type: QueryTypes.SELECT, transaction },
  );
  return { promoted: rows.length, demoted: 0 };
};

/** Backfill / admin path — both directions, plus the resulting total. */
const recomputeBoth = async (
  transaction: Awaited<ReturnType<typeof sequelize.transaction>>,
): Promise<{ promoted: number; demoted: number; nativeTotal: number }> => {
  // RETURNING the new value reports the two directions separately — "12
  // promoted, 0 demoted" is the useful line, and a run that demotes hundreds is
  // the shape of an import gone wrong.
  const changed = await sequelize.query<{ nativeArtist: boolean }>(
    `WITH eligible AS (
       SELECT DISTINCT m."artistId" AS id
         FROM track_artist_mappings m
         JOIN tracks t ON t.id = m."trackId"
        WHERE ${QUALIFIES_SQL}
     )
     UPDATE artists a
        SET "nativeArtist" = EXISTS (SELECT 1 FROM eligible e WHERE e.id = a.id)
      WHERE a."nativeArtist"
            IS DISTINCT FROM EXISTS (SELECT 1 FROM eligible e WHERE e.id = a.id)
  RETURNING a."nativeArtist"`,
    { type: QueryTypes.SELECT, transaction },
  );

  const totals = await sequelize.query<{ count: string }>(
    `SELECT COUNT(*)::int AS count FROM artists WHERE "nativeArtist" = true`,
    { type: QueryTypes.SELECT, transaction },
  );

  const promoted = changed.filter((r) => r.nativeArtist).length;
  return {
    promoted,
    demoted: changed.length - promoted,
    nativeTotal: Number(totals[0]?.count ?? 0),
  };
};

/** Current counts, without writing anything — what the CMS shows before a run. */
export const countNativeArtists = async (): Promise<{
  total: number;
  nativeTotal: number;
}> => {
  const rows = await sequelize.query<{ total: string; nativeTotal: string }>(
    `SELECT COUNT(*)::int                                        AS total,
            COUNT(*) FILTER (WHERE "nativeArtist" = true)::int   AS "nativeTotal"
       FROM artists`,
    { type: QueryTypes.SELECT },
  );
  return {
    total: Number(rows[0]?.total ?? 0),
    nativeTotal: Number(rows[0]?.nativeTotal ?? 0),
  };
};
