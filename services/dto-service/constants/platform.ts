// ─── Platform aliasing ───────────────────────────────────────────────────────
//
// SOUND_TRACKING_APP was renamed to CREATOR. The rename is a NAME change only:
// the stored value stays 'SOUND_TRACKING_APP' everywhere, so
//
//   · no row is migrated — `users`, `faq_sections`, `featured_tracks`,
//     `user_stream_history` and the native-analytics rollups keep the value they
//     already hold, and the unique (email, platform) index cannot end up with a
//     CREATOR row and a SOUND_TRACKING_APP row for the same person;
//   · no access token already in the wild is invalidated — a token minted before
//     the rename carries platform 'SOUND_TRACKING_APP' and still passes every
//     platform gate, so nobody logged in on the old build is logged out or 403'd.
//
// The rule: fold aliases onto the stored value at the edge — request validation,
// query params, and the JWT session claim — and every `platform = :platform` bind
// downstream then works for both spellings without being touched. Compare with
// `isPlatform` rather than `===` in new code; see its note.
//
// Responses and the JWT claim are deliberately NOT rewritten to 'CREATOR': the
// old clients that read those fields keep seeing exactly what they saw before.
// Retiring 'SOUND_TRACKING_APP' as the stored value is a separate migration.

import { Platform } from "./common.enums";

/** Accepted alias → the value actually stored. */
const ALIAS_TO_STORED: Record<string, Platform> = {
  [Platform.CREATOR]: Platform.SOUND_TRACKING_APP,
};

/**
 * The stored form of a platform value.
 *
 * Anything that is not a known alias — including a value from a client that
 * predates the rename, and INTERNAL / ENTERPRISE / STUDIO — is returned
 * unchanged, so this is safe to apply to any platform-shaped value. null,
 * undefined and '' pass through untouched: "no platform filter" must stay that.
 *
 * Deliberately case-sensitive. Platform values are validated against the enum
 * before they get here, and accepting 'creator' would be a new tolerance rather
 * than part of this rename.
 */
export function normalizePlatform<T extends string | null | undefined>(
  value: T,
): T {
  if (!value) return value;
  return (ALIAS_TO_STORED[value] ?? value) as T;
}

/**
 * Alias-safe platform equality — `isPlatform(req.session?.platform, Platform.CREATOR)`.
 *
 * Prefer this to a bare `===` for the renamed platform. A plain
 * `platform === Platform.CREATOR` is a trap: everything downstream of the edge
 * sees the stored 'SOUND_TRACKING_APP', so that comparison is always false. This
 * normalizes both sides, so either name on either side matches.
 */
export const isPlatform = (
  value: string | null | undefined,
  platform: Platform,
): boolean => !!value && normalizePlatform(value) === normalizePlatform(platform);
