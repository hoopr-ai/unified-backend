import { Platform, isSfxTrackType } from "../../dto-service/modules.export";
import {
  findTrackByTrackCode,
  getRestrictedTrackTiersByBrandId,
} from "../../persistence-service/exports";
import { findStemsByTrackId } from "../../persistence-service/track/stem.persistence.service";
import { CreatorStemModel } from "../../persistence-service/track/schemas/creator-stem.schema";
import { toCdnUrl } from "../../helper-service/cdn.helper";
import { stemObjectPath, stemWaveformPath } from "../../helper-service/gcs.helper";
import { resolveViewerOwnerAccess } from "../access/owner-access.service";
import type { StemBundleStem } from "../../helper-service/stem-bundle.helper";

/**
 * Multitrack stems for the enterprise catalogue.
 *
 * The same `creator_stems` rows and the same bucket objects NATIVE-BE serves to
 * creator-web — this is the enterprise read of them, gated by the enterprise
 * rules rather than by a creator subscription.
 */

/** One stem as a client sees it. */
export interface StemItem {
  id: string;
  /**
   * Rendered verbatim by the client — the spacing and capitalisation are part
   * of the stored object name ("Supporting Elements").
   */
  stemType: string;
  nameSlug: string | null;
  /** CDN mp3 for the picker. Free to play, like the track preview. */
  streamLink: string;
  /** Peaks json for the waveform, same convention as the full mix. */
  waveformLink: string;
}

export interface TrackStemsResponse {
  trackId: string;
  trackCode: string;
  trackName: string | null;
  stems: StemItem[];
}

/**
 * The id the BUCKET is keyed by. The migration re-keyed the catalogue but left
 * storage laid out under the original hoopr uuid, so assets resolve by
 * `legacy_track_id`; `track_id` is the fallback for any row ingested natively
 * after the migration, where the two are the same anyway.
 */
const assetId = (stem: CreatorStemModel): string =>
  stem.legacyTrackId ?? stem.trackId;

/**
 * `source_link` is deliberately never mapped into any response: it holds the
 * raw Dropbox master, and the legacy `GET /track/stems` handed those to
 * unauthenticated callers, which leaked ungated masters. Playback uses
 * `streamLink`; saving the files goes through the licence download.
 */
const toStemItem = (stem: CreatorStemModel, isSfx: boolean): StemItem => {
  const type = stem.stemType ?? "";
  // The stem type names the object verbatim, so the segment is percent-encoded
  // for the URL while GCS itself takes the raw form.
  const encoded = encodeURIComponent(type);
  return {
    id: stem.id,
    stemType: type,
    nameSlug: stem.nameSlug,
    streamLink: toCdnUrl(stemObjectPath(assetId(stem), encoded, isSfx)),
    waveformLink: toCdnUrl(stemWaveformPath(assetId(stem), encoded, isSfx)),
  };
};

/** Shape the bundle builder needs: the asset id and the verbatim type. */
export const toBundleStems = (stems: CreatorStemModel[]): StemBundleStem[] =>
  stems
    .filter((s) => !!s.stemType)
    .map((s) => ({ assetTrackId: assetId(s), stemType: s.stemType! }));

/** Every live stem of a track, by the track's id. Used by the download flow. */
export const getStemsForTrackId = async (
  trackId: string,
): Promise<CreatorStemModel[]> => findStemsByTrackId(trackId);

/**
 * GET /tracks/:trackCode/stems
 *
 * Returns null when the track is not visible to this viewer, so the controller
 * can 404 — stem visibility is decided by exactly the same owner/tier/status
 * gate as the track itself (findTrackByTrackCode), which is what stops the two
 * from ever drifting apart.
 *
 * A visible track with no stems is a 200 with `stems: []`, not a 404.
 */
export const getTrackStemsService = async (
  trackCode: string,
  brandId?: number,
  platform?: Platform,
): Promise<TrackStemsResponse | null> => {
  const [ownerAccess, excludeTiers] = await Promise.all([
    resolveViewerOwnerAccess(brandId, platform),
    brandId
      ? getRestrictedTrackTiersByBrandId(brandId)
      : Promise.resolve(undefined),
  ]);

  const track = await findTrackByTrackCode(
    trackCode,
    ownerAccess.excludeOwnerIds,
    excludeTiers,
  );
  if (!track) {
    return null;
  }

  const stems = await findStemsByTrackId(track.id);
  const isSfx = isSfxTrackType(track.type);

  return {
    trackId: track.id,
    trackCode: track.trackCode,
    trackName: track.name,
    stems: stems.map((stem) => toStemItem(stem, isSfx)),
  };
};
