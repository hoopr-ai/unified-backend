import {
  countNativeArtists,
  recomputeNativeArtistFlags,
  type NativeArtistRecomputeMode,
  type NativeArtistRecomputeResult,
} from "../../persistence-service/artists/modules.export";
import { logger } from "../../helper-service/logger";

export type { NativeArtistRecomputeMode, NativeArtistRecomputeResult };

// ---------------------------------------------------------------------------
// Internal-admin surface over artists."nativeArtist".
//
// The flag is derived (see artist.persistence.service for the definition), so
// there is nothing to edit here — only "recompute it now" and "how many are
// flagged". The nightly cron calls executeNativeArtistRecompute() directly;
// the admin route is the manual trigger for right after a catalogue import.
// ---------------------------------------------------------------------------

export interface NativeArtistStatus {
  /** Artists in the catalogue. */
  total: number;
  /** Of those, how many are native (Creator-platform) artists. */
  nativeTotal: number;
}

export const getNativeArtistStatusService = async (): Promise<NativeArtistStatus> =>
  countNativeArtists();

/**
 * Run a recompute and log the outcome.
 *
 * Default mode is "promote": only unflagged artists are examined and the flag
 * can only turn on. That is what the cron wants — it is the cheap direction and
 * the only one that changes day to day. Pass "full" to also demote artists
 * whose Originals catalogue went away.
 */
export const executeNativeArtistRecompute = async (
  mode: NativeArtistRecomputeMode = "promote",
): Promise<NativeArtistRecomputeResult> => {
  const result = await recomputeNativeArtistFlags(mode);
  logger.info(
    `[NativeArtist] ${result.mode} recompute: +${result.promoted} / -${result.demoted} in ${result.durationMs}ms`,
  );
  return result;
};
