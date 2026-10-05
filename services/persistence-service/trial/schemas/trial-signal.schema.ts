import {
  Table,
  Column,
  Model,
  DataType,
  PrimaryKey,
  AutoIncrement,
  AllowNull,
} from "sequelize-typescript";

// FE-reported signals the journey routes on — see scripts/create-smash-trial-tables.sql.
// Append-only; `kind` is a TrialSignalKind.
export interface TrialSignalAttributes {
  id?: number;
  userId: number;
  brandId?: number | null;
  kind: string;
  trackCode?: string | null;
  sendId?: number | null;
  granted?: boolean | null;
  createdAt?: Date;
}

@Table({ tableName: "trial_signals", timestamps: true, updatedAt: false })
export class TrialSignalModel extends Model<TrialSignalModel, TrialSignalAttributes> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  id!: number;

  @AllowNull(false)
  @Column({ type: DataType.INTEGER, field: "userId" })
  userId!: number;

  @AllowNull(true)
  @Column({ type: DataType.BIGINT, field: "brandId" })
  brandId?: number | null;

  @AllowNull(false)
  @Column({ type: DataType.STRING(50), field: "kind" })
  kind!: string;

  @AllowNull(true)
  @Column({ type: DataType.STRING(100), field: "trackCode" })
  trackCode?: string | null;

  @AllowNull(true)
  @Column({ type: DataType.INTEGER, field: "sendId" })
  sendId?: number | null;

  @AllowNull(true)
  @Column({ type: DataType.BOOLEAN, field: "granted" })
  granted?: boolean | null;

  @Column({ type: DataType.DATE, field: "createdAt" })
  createdAt!: Date;
}
