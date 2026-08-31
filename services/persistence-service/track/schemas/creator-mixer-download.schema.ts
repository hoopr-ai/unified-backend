import {
  AutoIncrement,
  Column,
  DataType,
  Model,
  PrimaryKey,
  Table,
} from "sequelize-typescript";

/**
 * What an INSERT must supply. Declared separately, and passed as the model's
 * second type argument, so `create()` is checked against it instead of against
 * the full row — which would demand `id` (an identity column) and every
 * nullable field on every insert.
 */
export interface CreatorMixerDownloadCreation {
  userId: number;
  platform: string;
  trackId: string;
  trackCode: string | null;
  fileName: string | null;
  format: string | null;
  stemDetails: unknown;
  recipeHash: string | null;
  status: string;
  licenseId: number | null;
  createdAt: Date | null;
  updatedAt: Date | null;
  expiresAt: Date;
}

/**
 * Maps `creator_mixer_downloads` — one row per mix rendered in the multitrack
 * mixer.
 *
 * This table is SHARED, like `creator_stems`: it was migrated out of hoopr's
 * consumer mixer by NATIVE-BE (migration/creator/schema.sql + migrate.py) and
 * shaped by native-be's scripts/migration-add-mixer-downloads.sql. Unlike
 * creator_stems, unified WRITES to it — the enterprise mixer stores its renders
 * here rather than in a table of its own, so one mix history exists rather than
 * two that have to be reconciled.
 *
 * `platform` is what keeps the two products apart; see
 * scripts/migration-add-mixer-platform.sql. Rows written here are ENTERPRISE.
 *
 * snake_case, so every column needs an explicit `field`. `timestamps: false`
 * because the global `define` in database.ts turns timestamps on and would look
 * for "createdAt"/"updatedAt"; this table spells them created_at / updated_at.
 */
@Table({ tableName: "creator_mixer_downloads", timestamps: false })
export class CreatorMixerDownloadModel extends Model<
  CreatorMixerDownloadModel,
  CreatorMixerDownloadCreation
> {
  @PrimaryKey
  @AutoIncrement
  @Column({ type: DataType.BIGINT, field: "id" })
  id!: number;

  /** `users.id`. No FK — `users` is shared and owned by nobody in particular. */
  @Column({ type: DataType.BIGINT, field: "user_id", allowNull: false })
  userId!: number;

  /**
   * Which product rendered this mix: 'ENTERPRISE' for everything written here,
   * 'CREATOR' for creator-web's rows — the values `users.platform` actually
   * holds. Defaulted in the DB so NATIVE-BE's inserts, which do not know the
   * column exists, keep working.
   */
  @Column({ type: DataType.STRING, field: "platform", allowNull: false })
  platform!: string;

  /**
   * Sage `tracks.id`.
   *
   * ⚠ For MIGRATED rows (track_code IS NULL) this is the HOOPR track uuid,
   * copied verbatim without the pastIds remap creator_stems got — it joins
   * nothing in this catalogue. Read `trackCode` to tell them apart.
   */
  @Column({ type: DataType.UUID, field: "track_id", allowNull: false })
  trackId!: string;

  /** Set on rows written by an app rather than migrated. */
  @Column({ type: DataType.STRING, field: "track_code", allowNull: true })
  trackCode!: string | null;

  /**
   * Legacy: an absolute PUBLIC url that never expired, on one of three retired
   * hosts. Rows written here leave this null and carry `gcsPath` instead — a
   * signed link cannot be persisted, because expiring is the point of it.
   */
  @Column({ type: DataType.TEXT, field: "download_link", allowNull: true })
  downloadLink!: string | null;

  /** Object path inside SELECT_BUCKET (private). */
  @Column({ type: DataType.TEXT, field: "gcs_path", allowNull: true })
  gcsPath!: string | null;

  /** Basename the browser saves as, extension included. */
  @Column({ type: DataType.STRING, field: "file_name", allowNull: true })
  fileName!: string | null;

  /** 'wav' | 'mp3'. */
  @Column({ type: DataType.STRING, field: "format", allowNull: true })
  format!: string | null;

  @Column({ type: DataType.BIGINT, field: "size_bytes", allowNull: true })
  sizeBytes!: string | null;

  /**
   * The recipe, verbatim: `[{ stemId, volume, tempo, pitch }, …]`. Kept — not
   * just hashed — so a mix can be reopened with the faders where they were
   * left, and reproduced after a cleanup sweep has removed the object.
   */
  @Column({ type: DataType.JSONB, field: "stem_details", allowNull: true })
  stemDetails!: unknown;

  /**
   * sha256 of the normalised recipe. Unique per (user, recipe) among READY rows
   * via uq_creator_mixdl_recipe, which is both the dedup lookup and the
   * concurrency guard.
   */
  @Column({ type: DataType.STRING, field: "recipe_hash", allowNull: true })
  recipeHash!: string | null;

  /** PENDING | READY | FAILED. Migrated rows default to READY. */
  @Column({ type: DataType.STRING, field: "status", allowNull: false })
  status!: string;

  /** Why a FAILED row failed. Logged in full; truncated here. */
  @Column({ type: DataType.TEXT, field: "error", allowNull: true })
  error!: string | null;

  /** Shared `licenses`.id this mix was rendered under. */
  @Column({ type: DataType.BIGINT, field: "license_id", allowNull: true })
  licenseId!: number | null;

  @Column({ type: DataType.DATE, field: "created_at", allowNull: true })
  createdAt!: Date | null;

  @Column({ type: DataType.DATE, field: "updated_at", allowNull: true })
  updatedAt!: Date | null;

  /**
   * When the OBJECT goes away, not the row. Legacy rows carry 2100-12-31
   * (hoopr's "never"); rows written here get now + MIXER_TTL_DAYS so the bucket
   * does not grow without bound.
   */
  @Column({ type: DataType.DATE, field: "expires_at", allowNull: false })
  expiresAt!: Date;
}
