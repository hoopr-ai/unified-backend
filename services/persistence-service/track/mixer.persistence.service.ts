import { CreatorMixerDownloadModel } from "./schemas/creator-mixer-download.schema";

/**
 * Row access for the enterprise multitrack mixer.
 *
 * Every read here is scoped by BOTH userId and platform. The scoping is not
 * redundant: `creator_mixer_downloads` is shared with NATIVE-BE's creator
 * mixer, and while a `users` row belongs to exactly one platform — so an id
 * collision cannot actually happen — a read that relied on that would be
 * relying on a fact this table does not state. See
 * scripts/migration-add-mixer-platform.sql.
 */

/**
 * The platform value every row written from this service carries.
 *
 * Its counterpart on creator-web's rows is 'CREATOR' — matching
 * `users.platform`, NOT the 'SOUND_TRACKING_APP' that platform.ts describes as
 * the stored spelling. See scripts/migration-add-mixer-platform.sql.
 */
export const MIXER_PLATFORM = "ENTERPRISE";

export interface MixerRowInput {
  userId: number;
  trackId: string;
  trackCode: string;
  fileName: string;
  format: string;
  stemDetails: unknown;
  recipeHash: string;
  licenseId: number | null;
  expiresAt: Date;
}

/**
 * The PENDING row, written BEFORE the render starts.
 *
 * Deliberately not written after: a process killed mid-ffmpeg then leaves a row
 * that says what was attempted, rather than nothing at all. `id` comes from the
 * identity native-be's migration attached — as originally migrated this column
 * had no default and every insert failed.
 */
export const createPendingMix = async (
  input: MixerRowInput,
): Promise<CreatorMixerDownloadModel> => {
  const now = new Date();
  return CreatorMixerDownloadModel.create({
    userId: input.userId,
    platform: MIXER_PLATFORM,
    trackId: input.trackId,
    trackCode: input.trackCode,
    fileName: input.fileName,
    format: input.format,
    stemDetails: input.stemDetails,
    recipeHash: input.recipeHash,
    status: "PENDING",
    licenseId: input.licenseId,
    createdAt: now,
    updatedAt: now,
    expiresAt: input.expiresAt,
  });
};

export const markMixReady = async (
  id: number,
  gcsPath: string,
  sizeBytes: number,
): Promise<void> => {
  await CreatorMixerDownloadModel.update(
    { gcsPath, sizeBytes: String(sizeBytes), status: "READY", updatedAt: new Date() },
    { where: { id } },
  );
};

export const markMixFailed = async (id: number, message: string): Promise<void> => {
  await CreatorMixerDownloadModel.update(
    { status: "FAILED", error: message.slice(0, 2000), updatedAt: new Date() },
    { where: { id } },
  );
};

export const deleteMixRow = async (id: number): Promise<void> => {
  await CreatorMixerDownloadModel.destroy({ where: { id } });
};

/**
 * The newest READY row for this exact recipe, which is what makes an identical
 * request reuse a render instead of paying for it twice.
 */
export const findReadyMixByRecipe = async (
  userId: number,
  recipeHash: string,
): Promise<CreatorMixerDownloadModel | null> =>
  CreatorMixerDownloadModel.findOne({
    where: { userId, platform: MIXER_PLATFORM, recipeHash, status: "READY" },
    order: [["id", "DESC"]],
  });

export const findMixById = async (
  userId: number,
  id: number,
): Promise<CreatorMixerDownloadModel | null> =>
  CreatorMixerDownloadModel.findOne({
    where: { id, userId, platform: MIXER_PLATFORM },
  });

export const listMixesForUser = async (
  userId: number,
  page: number,
  limit: number,
): Promise<{ rows: CreatorMixerDownloadModel[]; count: number }> =>
  CreatorMixerDownloadModel.findAndCountAll({
    where: { userId, platform: MIXER_PLATFORM },
    order: [
      ["createdAt", "DESC"],
      ["id", "DESC"],
    ],
    offset: (page - 1) * limit,
    limit,
  });

/**
 * Demote a READY row whose object has gone.
 *
 * `expires_at` is not proof the object is there — a cleanup sweep can remove it
 * early — so the signing call is what decides. When it says the object is gone,
 * the row has to stop claiming READY or uq_creator_mixdl_recipe will block the
 * fresh render that replaces it.
 */
export const demoteMissingMix = async (id: number): Promise<void> => {
  await CreatorMixerDownloadModel.update(
    {
      status: "FAILED",
      error: "Object missing at sign time (expired or swept).",
      updatedAt: new Date(),
    },
    { where: { id } },
  );
};

/** Postgres 23505, named so the caller reads as intent rather than magic string. */
export const isUniqueViolation = (cause: unknown): boolean => {
  if (typeof cause !== "object" || cause === null) return false;
  const err = cause as {
    name?: string;
    original?: { code?: string };
    parent?: { code?: string };
  };
  return (
    err.name === "SequelizeUniqueConstraintError" ||
    err.original?.code === "23505" ||
    err.parent?.code === "23505"
  );
};

/**
 * The mix a licence paid for.
 *
 * The link is one-directional — `creator_mixer_downloads.license_id` points at
 * `licenses.id`, and nothing on `licenses` points back — so resolving a licence
 * to its mix is this lookup rather than a join the licence row can do itself.
 *
 * One row per licence by construction: the mixer writes a fresh licence for
 * every render (see createMixLicense), so a licence id is never shared by two
 * mixes. `ORDER BY id DESC` is belt and braces for a hand-written row.
 */
export const findMixByLicenseId = async (
  licenseId: number,
): Promise<CreatorMixerDownloadModel | null> =>
  CreatorMixerDownloadModel.findOne({
    where: { licenseId, platform: MIXER_PLATFORM, status: "READY" },
    order: [["id", "DESC"]],
  });
