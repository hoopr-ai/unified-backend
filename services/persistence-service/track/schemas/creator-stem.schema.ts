import { Column, DataType, Model, PrimaryKey, Table } from "sequelize-typescript";

/**
 * Maps `creator_stems` — the multitrack stems hoopr-backend originally owned,
 * migrated into the shared DB by NATIVE-BE (migration/creator/migrate.py).
 *
 * This table is SHARED and NATIVE-BE owns its shape; unified only ever reads
 * it. Every column is mapped anyway so a create-only `sequelize.sync()` on a
 * fresh DB produces the same table rather than a truncated one.
 *
 * snake_case, unlike the quoted-camelCase tables the rest of this service maps,
 * so every column needs an explicit `field`. `timestamps: false` because the
 * global `define` in database.ts turns timestamps on and would look for
 * "createdAt"/"updatedAt"; this table spells them created_at / updated_at.
 */
@Table({ tableName: "creator_stems", timestamps: false })
export class CreatorStemModel extends Model<CreatorStemModel> {
  @PrimaryKey
  @Column({ type: DataType.UUID, field: "id" })
  id!: string;

  /** The sage `tracks.id` this stem was bridged to. Joins the catalogue. */
  @Column({ type: DataType.UUID, field: "track_id", allowNull: false })
  trackId!: string;

  /**
   * The ORIGINAL hoopr track uuid. This — not `trackId` — is what the audio
   * bucket and CDN are keyed by, because the migration re-keyed the catalogue
   * without re-laying-out storage. Building a stem asset path from `trackId`
   * 404s for every migrated stem. See stemObjectPath in gcs.helper.
   */
  @Column({ type: DataType.UUID, field: "legacy_track_id", allowNull: true })
  legacyTrackId!: string | null;

  /**
   * Display name AND the object-name segment, verbatim: "Drums", "Bass",
   * "Supporting Elements". Case and spaces are significant.
   */
  @Column({ type: DataType.STRING, field: "stem_type", allowNull: true })
  stemType!: string | null;

  /**
   * The raw ingest master (Dropbox .wav links). INTERNAL ONLY — the legacy
   * `GET /track/stems` handed these to unauthenticated callers, which leaked
   * ungated masters. Never mapped into a customer response.
   */
  @Column({ type: DataType.TEXT, field: "source_link", allowNull: true })
  sourceLink!: string | null;

  @Column({ type: DataType.STRING, field: "name_slug", allowNull: true })
  nameSlug!: string | null;

  @Column({ type: DataType.DATE, field: "created_at", allowNull: true })
  createdAt!: Date | null;

  @Column({ type: DataType.DATE, field: "updated_at", allowNull: true })
  updatedAt!: Date | null;

  /** Soft delete, carried over from the legacy paranoid model. */
  @Column({ type: DataType.DATE, field: "deleted", allowNull: true })
  deleted!: Date | null;
}
