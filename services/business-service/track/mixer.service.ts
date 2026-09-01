import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Op } from "sequelize";

import { AppError } from "../../helper-service/AppError";
import { logger } from "../../helper-service/logger";
import {
  deleteGCSObject,
  downloadGCSObjectToFile,
  getGCSObjectWithMetadata,
  mixObjectPath,
  stemObjectPath,
  uploadFileToGCS,
} from "../../helper-service/gcs.helper";
import {
  RenderQueue,
  renderMix,
  type StemRender,
} from "../../helper-service/mixer.helper";
import {
  createPendingMix,
  deleteMixRow,
  demoteMissingMix,
  findMixById,
  findReadyMixByRecipe,
  isUniqueViolation,
  listMixesForUser,
  markMixFailed,
  markMixReady,
} from "../../persistence-service/track/mixer.persistence.service";
import { findStemsByTrackId } from "../../persistence-service/track/stem.persistence.service";
import {
  createLicenseRecord,
  deductTokenAssignedByType,
  findTrackByTrackCode,
} from "../../persistence-service/exports";
import { LicenseModel } from "../../persistence-service/licenses/schemas/modules.export";
import { OwnerModel } from "../../persistence-service/owner/modules.export";
import { UserModel } from "../../persistence-service/user/schemas/modules.export";
import { TokenDeductionReason } from "../../persistence-service/token/schemas/modules.export";
import { isSfxTrackType } from "../../dto-service/modules.export";

/**
 * The enterprise multitrack mixer.
 *
 * Ported from NATIVE-BE's src/modules/mixer (itself a port of hoopr-backend's
 * POST /consumer/mixer/createMix). The render pipeline, the recipe hashing and
 * the storage layout are the same — see mixer.helper.ts and gcs.helper's
 * mixObjectPath — because both products render the same stems out of the same
 * bucket and a mix should not sound different depending on which app made it.
 *
 * WHAT IS DIFFERENT HERE, and why:
 *
 *  1. NO ENTITLEMENT GATE. NATIVE-BE gates on an active paid CREATOR
 *     subscription; no enterprise brand holds one, so porting that check
 *     verbatim would refuse every caller. Nothing replaces it: any brand user
 *     may render, and the token charge below is what makes a mix cost
 *     something — the same shape as a track download, which is also open to
 *     any brand user and priced by its deduction.
 *
 *  2. TOKENS. A render charges one token, through the same
 *     `deductTokenAssignedByType` a track licence charges, against the pack
 *     matching the track's owner type. An unlimited pack moves no balance but
 *     still writes its audit row; a finite one decrements. A brand with no
 *     matching pack is NOT refused — see the deduction-failure branch, which
 *     documents where that check would go if it is ever wanted.
 *
 *  3. CATALOGUE SCOPE. Only Hoopr Originals masters can be remixed. This is a
 *     RIGHTS rule and stands on its own — it did not come from the token gate
 *     and did not go away with it.
 */

const CONTENT_TYPE: Record<string, string> = {
  wav: "audio/wav",
  mp3: "audio/mpeg",
};

/**
 * One render, one token — the same unit price a track licence pays.
 *
 * Charged AFTER the render succeeds: charging first would bill for a failed
 * ffmpeg run, and charging on a deduplicated reuse would bill twice for one
 * artifact. The consequence is that a brand with no credit still gets the mix
 * (logged, uncharged); moving the check before the render is the deliberate
 * change to make if that is ever unacceptable.
 */
const TOKEN_COST_PER_MIX = 1;

/** Owner `type` whose catalogue the Originals allocation covers. */
const ORIGINALS_OWNER_TYPE = "hoopr originals";

// Two at a time. See RenderQueue — this process also serves every catalogue
// read, and renders must not be able to starve them.
const queue = new RenderQueue(
  Math.max(1, parseInt(process.env.MIXER_CONCURRENCY ?? "2", 10) || 2),
);

const defaultFormat = (): "wav" | "mp3" =>
  process.env.MIXER_DEFAULT_FORMAT === "mp3" ? "mp3" : "wav";

const ttlDays = (): number => {
  const parsed = parseInt(process.env.MIXER_TTL_DAYS ?? "30", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 30;
};

/** One fader position, as the client sends it. */
export interface MixStemInput {
  stemId: string;
  volume?: number;
  tempo?: number;
  /** Legacy alias for `tempo`; `tempo` wins when both are sent. */
  bpm?: number;
  pitch?: number;
}

export interface CreateMixInput {
  trackCode: string;
  stems: MixStemInput[];
  format?: "wav" | "mp3";
}

/** One stem's settings, normalised. This — not the request body — is hashed. */
interface Recipe {
  stemId: string;
  volume: number;
  tempo?: number;
  pitch?: number;
}

export interface MixResult {
  mixId: number;
  trackCode: string;
  trackName: string | null;
  fileName: string;
  format: string;
  sizeBytes: number | null;
  /** Signed, expiring GET that saves rather than plays. */
  downloadLink: string;
  licenseId: number | null;
  /** false when an identical render already existed and was reused. */
  rendered: boolean;
  expiresAt: Date;
  /**
   * Tokens left on the pack that was charged. Meaningful for a finite pack;
   * always 0 alongside `unlimitedTokens: true` for an unlimited one, and 0 when
   * nothing could be charged at all.
   */
  remainingTokens: number;
  unlimitedTokens?: true;
}

export interface MixHistoryItem {
  mixId: number;
  trackId: string;
  trackCode: string | null;
  fileName: string | null;
  format: string | null;
  sizeBytes: number | null;
  status: string;
  stemDetails: unknown;
  createdAt: Date | null;
  expiresAt: Date;
  /** false once the TTL has passed — the row survives, the object does not. */
  available: boolean;
}

export interface MixHistory {
  mixes: MixHistoryItem[];
  pagination: {
    page: number;
    limit: number;
    totalItems: number;
    totalPages: number;
  };
}

// ── Recipe ───────────────────────────────────────────────────────────────────

/**
 * Normalise the request into the canonical recipe.
 *
 * Sorted by stemId and rounded to a fixed precision so the same mix described
 * two different ways — stems in another order, 1.0 vs 1.000001 — hashes the
 * same and reuses the same render. Without that the dedup index would never hit
 * for anything but a byte-identical payload.
 */
const toRecipe = (stems: MixStemInput[]): Recipe[] => {
  const round = (n: number) => Math.round(n * 1000) / 1000;
  return stems
    .map((s) => {
      const tempo = s.tempo ?? s.bpm;
      const recipe: Recipe = { stemId: s.stemId, volume: s.volume ?? 100 };
      if (tempo !== undefined && round(tempo) !== 1) recipe.tempo = round(tempo);
      if (s.pitch !== undefined && round(s.pitch) !== 1) recipe.pitch = round(s.pitch);
      return recipe;
    })
    // Muted stems are dropped, not mixed at zero gain: amix would still decode
    // and length-extend from them, so a muted 5-minute pad would keep padding
    // the output with silence.
    .filter((r) => r.volume > 0)
    .sort((a, b) => a.stemId.localeCompare(b.stemId));
};

const hashRecipe = (trackCode: string, format: string, recipe: Recipe[]): string =>
  createHash("sha256")
    .update(JSON.stringify({ v: 1, trackCode, format, recipe }))
    .digest("hex");

/** `<Track Name>_<stem>_<stem>.<ext>`, the shape legacy produced. */
const fileNameFor = (
  trackName: string | null,
  stemNames: string[],
  format: string,
): string => {
  const base = (trackName ?? "mix").replace(/\s+/g, "_");
  const parts = stemNames.map((n) => n.replace(/\s+/g, "_")).filter(Boolean);
  const name = [base, ...parts].join("_").replace(/[^A-Za-z0-9._-]/g, "");
  return `${(name || "mix").slice(0, 180)}.${format}`;
};

// ── Create ───────────────────────────────────────────────────────────────────

/**
 * POST /mixer/mix — render, store, license and hand back a download link.
 *
 * Synchronous: the client shows a spinner and expects a link in the response,
 * which is the contract creator-web's mixer already has. The row carries a
 * `status` regardless, so moving the render onto the stem-bundle queue later is
 * a change to this function alone — nothing downstream assumes a row is READY
 * the moment it exists.
 */
export const createMixService = async (
  userId: number,
  input: CreateMixInput,
): Promise<MixResult> => {
  // ── Who is asking, and may they ──────────────────────────────────────────
  const user = await UserModel.findByPk(userId, {
    attributes: ["id", "brandId"],
  });
  if (!user) throw new AppError("User not found", 404);
  if (!user.brandId) {
    throw new AppError("User is not associated with any brand", 400);
  }
  const brandId = user.brandId;

  // No entitlement gate. Any brand user may render; the charge below is what
  // makes a mix cost something, exactly as it is for a track download. There is
  // deliberately no "unlimited plan only" check here — see the note on
  // TOKEN_COST_PER_MIX.

  // ── What are they mixing ─────────────────────────────────────────────────
  const format = input.format ?? defaultFormat();
  const track = await findTrackByTrackCode(input.trackCode);
  // findTrackByTrackCode already restricts to status = 'ACTIVE'.
  if (!track) throw new AppError("Track not found", 404);
  if (isSfxTrackType(track.type)) {
    throw new AppError("SFX tracks have no stems to mix.", 400);
  }

  // The track's owner type is BOTH the rights rule and the billing key.
  //
  // Rights: only Hoopr Originals masters may be remixed. That restriction long
  // predates the token gate that used to sit above and does not fall with it —
  // the other stem-bearing catalogue (International, Chartbusters, Regional &
  // Indie) is licensed to us for distribution, not for re-cutting.
  //
  // Billing: the owner type IS the token pack type, which is how
  // licenseTrackService picks what to charge. Taking it from the track rather
  // than from a pre-selected allocation means the deduction below charges the
  // pack that actually covers this master.
  const ownerIds: string[] = (track.ownerId as string[] | null) ?? [];
  const owners = ownerIds.length
    ? await OwnerModel.findAll({
        where: { id: { [Op.in]: ownerIds } },
        attributes: ["id", "type"],
      })
    : [];
  const originalsOwner = owners.find(
    (o) => (o.type ?? "").trim().toLowerCase() === ORIGINALS_OWNER_TYPE,
  );
  if (!originalsOwner) {
    throw new AppError(
      "This track is not part of the Hoopr Originals catalogue.",
      403,
    );
  }

  const recipe = toRecipe(input.stems);
  if (!recipe.length) {
    throw new AppError("At least one stem must have a volume above 0.", 400);
  }

  // Stems are looked up BY TRACK and then filtered to what was asked for. That
  // ordering is the point: it is what stops a stem id belonging to another
  // track from being pulled into a mix of a track this brand may mix.
  const trackStems = await findStemsByTrackId(track.id);
  const byId = new Map(trackStems.map((s) => [s.id, s]));
  const missing = recipe.filter((r) => !byId.has(r.stemId)).map((r) => r.stemId);
  if (missing.length) {
    throw new AppError(
      `Stem(s) not found for this track: ${missing.join(", ")}`,
      404,
    );
  }
  const chosen = recipe.map((r) => byId.get(r.stemId)!);
  if (chosen.some((s) => !s.stemType)) {
    throw new AppError("Stem audio is not available for this track.", 400);
  }

  const recipeHash = hashRecipe(track.trackCode, format, recipe);

  // ── Reuse before rendering ───────────────────────────────────────────────
  // `expires_at` alone is not proof the object is there, so the signing call —
  // which stats the object — is what decides. A reused render is not charged
  // again: no new artifact is produced, and the audit row for the render that
  // did produce it already exists.
  const existing = await findReadyMixByRecipe(userId, recipeHash);
  if (existing?.gcsPath) {
    const signed = await getGCSObjectWithMetadata({
      gcsPath: existing.gcsPath,
      contentType: CONTENT_TYPE[existing.format ?? format] ?? "audio/wav",
      downloadName: existing.fileName ?? `mix.${format}`,
    });
    if (signed) {
      logger.info(
        `[Mixer] Reused mix ${existing.id} for user ${userId} (${track.trackCode}, ${recipeHash.slice(0, 12)})`,
      );
      return toResult(existing, track.name ?? null, signed.downloadLink, false);
    }
    // Object gone but the row says READY — demote it so the unique index does
    // not block the fresh render about to replace it.
    await demoteMissingMix(existing.id);
  }

  // ── Licence, row, render ─────────────────────────────────────────────────
  const licenseId = await createMixLicense(userId, brandId, track.trackCode);

  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlDays() * 24 * 60 * 60 * 1000);
  const fileName = fileNameFor(
    track.name ?? null,
    chosen.map((s) => s.nameSlug ?? s.stemType ?? ""),
    format,
  );

  const row = await createPendingMix({
    userId,
    trackId: track.id,
    trackCode: track.trackCode,
    fileName,
    format,
    stemDetails: recipe,
    recipeHash,
    licenseId,
    expiresAt,
  });

  const gcsPath = mixObjectPath(userId, row.id, format);

  let sizeBytes: number;
  try {
    sizeBytes = await queue.run(() =>
      render({
        recipe,
        stems: byId,
        trackId: track.id,
        gcsPath,
        format,
      }),
    );
    // INSIDE the try, and that placement is the whole point: the row is
    // inserted PENDING, so uq_creator_mixdl_recipe — which only covers READY
    // rows — is not violated by the insert. It is violated HERE, by the
    // promotion to READY, if a concurrent identical request got there first.
    // Promoting outside the try would let that 23505 escape as a 500 and skip
    // the reuse path below entirely.
    await markMixReady(row.id, gcsPath, sizeBytes);
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);

    // A duplicate on uq_creator_mixdl_recipe means a concurrent identical
    // request finished first. Its render is as good as ours, so drop ours and
    // serve theirs rather than failing a request that has a valid answer.
    if (isUniqueViolation(cause)) {
      await deleteGCSObject({ gcsPath }).catch(() => undefined);
      await deleteMixRow(row.id);
      const winner = await findReadyMixByRecipe(userId, recipeHash);
      if (winner?.gcsPath) {
        const signed = await getGCSObjectWithMetadata({
          gcsPath: winner.gcsPath,
          contentType: CONTENT_TYPE[winner.format ?? format] ?? "audio/wav",
          downloadName: winner.fileName ?? fileName,
        });
        if (signed) {
          return toResult(winner, track.name ?? null, signed.downloadLink, false);
        }
      }
    }

    await markMixFailed(row.id, message);
    logger.error(
      `[Mixer] Mix ${row.id} failed for user ${userId} (${track.trackCode}): ${message}`,
    );
    throw new AppError("The mix could not be rendered.", 400);
  }

  // Charged only once the render exists. Charging before it would bill for a
  // failed ffmpeg run; charging on reuse would bill twice for one artifact.
  const deduction = await deductTokenAssignedByType(
    brandId,
    originalsOwner.type as string,
    TOKEN_COST_PER_MIX,
    originalsOwner.id,
    TokenDeductionReason.LICENSE_PURCHASE,
    licenseId ?? undefined,
  );
  if (!deduction.success) {
    // Reachable now that nothing is checked up front: the brand may hold no
    // Hoopr Originals pack, or a finite one that has run dry. The mix is
    // already rendered and paid for in CPU, and withholding it here would
    // charge the user an error for our own ordering choice — so it is served
    // and the miss is logged for reconciliation. If mixes should instead be
    // refused without credit, the check belongs BEFORE the render, not here.
    logger.error(
      `[Mixer] Token deduction failed for brand ${brandId} on mix ${row.id} ` +
        `(type "${originalsOwner.type}") — mix served anyway, not charged`,
    );
  } else if (deduction.tokenAssignedId && licenseId) {
    // Same write-back licenseTrackService does: the licence records WHICH
    // allocation paid for it, which is what lets the token views reconcile a
    // pack against the licences drawn from it. Without it a mix licence looks
    // like it was issued against no allocation at all.
    await LicenseModel.update(
      { tokenId: deduction.tokenAssignedId },
      { where: { id: licenseId } },
    );
  }

  const signed = await getGCSObjectWithMetadata({
    gcsPath,
    contentType: CONTENT_TYPE[format],
    downloadName: fileName,
  });
  if (!signed) {
    // The upload reported success, so this means the object vanished between
    // two calls — worth an error rather than a silent empty link.
    throw new AppError("The mix could not be rendered.", 400);
  }

  logger.info(
    `[Mixer] Rendered mix ${row.id} for user ${userId}: ${track.trackCode}, ` +
      `${recipe.length} stem(s), ${format}, license ${licenseId ?? "none"}`,
  );

  row.gcsPath = gcsPath;
  row.status = "READY";
  row.sizeBytes = String(sizeBytes);
  return {
    ...toResult(row, track.name ?? null, signed.downloadLink, true),
    remainingTokens: deduction.isUnlimited ? 0 : deduction.remainingTokens,
    ...(deduction.isUnlimited && { unlimitedTokens: true as const }),
  };
};

/**
 * Fetch the stems, run ffmpeg, upload the result.
 *
 * Everything local happens inside one temp directory that the `finally` always
 * removes — an accumulation of failed renders is exactly how a box's disk fills.
 */
const render = async (opts: {
  recipe: Recipe[];
  stems: Map<string, { stemType: string | null; legacyTrackId: string | null; trackId: string }>;
  trackId: string;
  gcsPath: string;
  format: "wav" | "mp3";
}): Promise<number> => {
  const workDir = await mkdtemp(join(tmpdir(), "unified-mix-"));
  try {
    // Sequential, not Promise.all: N parallel multi-megabyte downloads on a
    // shared box is exactly the burst RenderQueue exists to avoid, and the
    // ffmpeg run dominates the wall clock anyway.
    const inputs: StemRender[] = [];
    for (const [index, entry] of opts.recipe.entries()) {
      const stem = opts.stems.get(entry.stemId)!;
      const localPath = join(workDir, `stem-${index}.mp3`);
      // legacy_track_id, falling back to track_id: the migration re-keyed the
      // catalogue but left storage laid out under the original hoopr uuid, so
      // building this path from `trackId` 404s for every migrated stem.
      const assetTrackId = stem.legacyTrackId ?? stem.trackId;
      const ok = await downloadGCSObjectToFile({
        gcsPath: stemObjectPath(assetTrackId, stem.stemType as string),
        destination: localPath,
      });
      if (!ok) {
        throw new Error(`Stem audio missing in storage: ${entry.stemId}`);
      }
      inputs.push({
        path: localPath,
        volume: entry.volume,
        tempo: entry.tempo,
        pitch: entry.pitch,
      });
    }

    const outputPath = join(workDir, `mix.${opts.format}`);
    await renderMix({ stems: inputs, outputPath, format: opts.format });

    const { sizeBytes } = await uploadFileToGCS({
      localPath: outputPath,
      gcsPath: opts.gcsPath,
      contentType: CONTENT_TYPE[opts.format],
    });
    return sizeBytes;
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }
};

/**
 * Every render gets its OWN licence row, tagged `type: 'mix'`.
 *
 * NATIVE-BE reuses an existing track licence instead, because there a mix costs
 * the creator nothing beyond the subscription they already hold. Here a render
 * is CHARGED — one token, per mix — so a licence per render is what makes the
 * charge legible: `GET /licenses/brand-history` shows one row per thing the
 * brand was billed for, and `creator_mixer_downloads.license_id` points at the
 * licence that paid for that exact mix rather than at whichever track licence
 * happened to exist first.
 *
 * Reusing would also have broken `POST /licenses/track-download`, which
 * resolves a mix through its licence: two mixes sharing one licence id have no
 * way to say which object to sign.
 *
 * Non-fatal: a mix the brand is entitled to should not be withheld because the
 * licence row could not be written. The failure is logged and the mix row
 * carries a null license_id — at the cost of that mix being unreachable from
 * the licences API, which is why it is an error-level log.
 */
const createMixLicense = async (
  userId: number,
  brandId: number,
  trackCode: string,
): Promise<number | null> => {
  try {
    const now = new Date();
    const validThrough = new Date(now);
    validThrough.setFullYear(validThrough.getFullYear() + 1);

    const created = await createLicenseRecord({
      brandId,
      userId,
      trackCode,
      tokenCost: TOKEN_COST_PER_MIX,
      type: "mix",
      licensedAt: now,
      validThrough,
      createdAt: now,
    });
    return created.id ?? null;
  } catch (cause) {
    logger.error(
      `[Mixer] Could not license ${trackCode} for user ${userId}: ${
        cause instanceof Error ? cause.message : String(cause)
      }`,
    );
    return null;
  }
};

// ── Reads ────────────────────────────────────────────────────────────────────

/** GET /mixer/downloads — this brand user's mix history, newest first. */
export const listMixesService = async (
  userId: number,
  page: number,
  limit: number,
): Promise<MixHistory> => {
  const { rows, count } = await listMixesForUser(userId, page, limit);
  const now = Date.now();

  return {
    mixes: rows.map((r) => ({
      mixId: Number(r.id),
      trackId: r.trackId,
      trackCode: r.trackCode,
      fileName: r.fileName,
      format: r.format,
      sizeBytes: r.sizeBytes == null ? null : Number(r.sizeBytes),
      status: r.status,
      stemDetails: r.stemDetails,
      createdAt: r.createdAt,
      expiresAt: r.expiresAt,
      available:
        r.status === "READY" && !!r.gcsPath && new Date(r.expiresAt).getTime() > now,
    })),
    pagination: {
      page,
      limit,
      totalItems: count,
      totalPages: Math.max(1, Math.ceil(count / limit)),
    },
  };
};

/**
 * POST /mixer/download — a fresh link for a mix already rendered.
 *
 * Needed because the link the render returned expires in 30 minutes while the
 * object lives for MIXER_TTL_DAYS: without this the history list would be a
 * list of things the brand cannot actually download.
 */
export const downloadMixService = async (
  userId: number,
  mixId: number,
): Promise<MixResult> => {
  const row = await findMixById(userId, mixId);
  if (!row) throw new AppError("Mix not found", 404);
  if (row.status !== "READY") {
    throw new AppError("This mix is not ready to download.", 400);
  }
  if (!row.gcsPath) {
    throw new AppError("Mix file is no longer available.", 404);
  }

  const format = row.format ?? "wav";
  const signed = await getGCSObjectWithMetadata({
    gcsPath: row.gcsPath,
    contentType: CONTENT_TYPE[format] ?? "audio/wav",
    downloadName: row.fileName ?? `mix.${format}`,
  });
  if (!signed) throw new AppError("Mix file is no longer available.", 404);

  return toResult(row, null, signed.downloadLink, false);
};

// ── Helpers ──────────────────────────────────────────────────────────────────

const toResult = (
  row: {
    id: number;
    trackCode: string | null;
    fileName: string | null;
    format: string | null;
    sizeBytes: string | null;
    licenseId: number | null;
    expiresAt: Date;
  },
  trackName: string | null,
  downloadLink: string,
  rendered: boolean,
): MixResult => {
  const fileName = row.fileName ?? `mix.${row.format ?? "wav"}`;
  return {
    mixId: Number(row.id),
    trackCode: row.trackCode ?? "",
    trackName,
    fileName,
    format: row.format ?? "wav",
    sizeBytes: row.sizeBytes == null ? null : Number(row.sizeBytes),
    downloadLink,
    licenseId: row.licenseId == null ? null : Number(row.licenseId),
    rendered,
    expiresAt: row.expiresAt,
    remainingTokens: 0,
  };
};
