import {
  Table,
  Column,
  Model,
  DataType,
  PrimaryKey,
  AutoIncrement,
  CreatedAt,
  UpdatedAt,
  Index,
} from "sequelize-typescript";

export type SmashPlusBriefMode = "explore" | "brief" | "reco";

export interface SmashPlusBriefAttributes {
  id?: number;
  mode: SmashPlusBriefMode;
  name: string;
  company: string;
  email: string;
  placements: string[];
  // Mode-specific. NULL means the field was not asked in this mode OR was asked
  // and left blank — the FE drops both from the body, so they cannot be told
  // apart here either; `mode` says which fields were on screen.
  question?: string | null; // explore
  song?: string | null; // brief
  exclusivity?: string | null; // brief
  budget?: string | null; // brief
  moods?: string[] | null; // reco
  reference?: string | null; // reco
  term?: string | null; // brief + reco
  territory?: string | null; // brief + reco
  goLiveDate?: string | null; // brief + reco, YYYY-MM-DD
  // Set only when the request carried a valid session — the page is public.
  userId?: number | null;
  brandId?: number | null;
  platform?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}

/**
 * Briefs from the public Smash Plus landing page (/smash-plus). One row per
 * submission; the Sales & Enterprise desk is emailed about each one, and this
 * table is the durable copy if that email is lost.
 *
 * Created by scripts/create-smash-plus-briefs-table.sql (sequence starts at
 * 1001 so the public reference reads "SP-1001", not "SP-1").
 */
@Table({
  tableName: "smash_plus_briefs",
  timestamps: true,
})
export class SmashPlusBriefModel extends Model<SmashPlusBriefModel, SmashPlusBriefAttributes> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.BIGINT)
  id!: number;

  @Column({ type: DataType.STRING(20), allowNull: false })
  mode!: SmashPlusBriefMode;

  @Column({ type: DataType.STRING(255), allowNull: false })
  name!: string;

  @Column({ type: DataType.STRING(255), allowNull: false })
  company!: string;

  @Index({ name: "idx_smash_plus_briefs_email" })
  @Column({ type: DataType.STRING(255), allowNull: false })
  email!: string;

  @Column({ type: DataType.ARRAY(DataType.TEXT), allowNull: false, defaultValue: [] })
  placements!: string[];

  @Column({ type: DataType.TEXT, allowNull: true })
  question?: string | null;

  @Column({ type: DataType.TEXT, allowNull: true })
  song?: string | null;

  @Column({ type: DataType.STRING(100), allowNull: true })
  exclusivity?: string | null;

  @Column({ type: DataType.STRING(255), allowNull: true })
  budget?: string | null;

  @Column({ type: DataType.ARRAY(DataType.TEXT), allowNull: true })
  moods?: string[] | null;

  @Column({ type: DataType.TEXT, allowNull: true })
  reference?: string | null;

  @Column({ type: DataType.STRING(100), allowNull: true })
  term?: string | null;

  @Column({ type: DataType.STRING(255), allowNull: true })
  territory?: string | null;

  @Column({ type: DataType.DATEONLY, allowNull: true })
  goLiveDate?: string | null;

  @Index({ name: "idx_smash_plus_briefs_user" })
  @Column({ type: DataType.BIGINT, allowNull: true })
  userId?: number | null;

  @Column({ type: DataType.BIGINT, allowNull: true })
  brandId?: number | null;

  @Column({ type: DataType.STRING(50), allowNull: true })
  platform?: string | null;

  @Column({ type: DataType.STRING(100), allowNull: true })
  ipAddress?: string | null;

  @Column({ type: DataType.TEXT, allowNull: true })
  userAgent?: string | null;

  @CreatedAt
  @Column({ type: DataType.DATE })
  createdAt!: Date;

  @UpdatedAt
  @Column({ type: DataType.DATE })
  updatedAt!: Date;
}
