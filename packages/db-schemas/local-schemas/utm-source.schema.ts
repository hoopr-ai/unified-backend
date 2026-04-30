import {
  Table, Column, Model, DataType, PrimaryKey, AutoIncrement,
  CreatedAt, ForeignKey, BelongsTo, Index,
} from "sequelize-typescript";
import { UserModel } from "../src/models/user.schema";

export interface UtmSourceAttributes {
  id?: number;
  userId: number;
  utmSource?: string | null;
  utmCampaign?: string | null;
  utmMedium?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt?: Date;
}

@Table({ tableName: "utm_sources", timestamps: true, updatedAt: false })
export class UtmSourceModel extends Model<UtmSourceModel, UtmSourceAttributes> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.BIGINT)
  id!: number;

  @ForeignKey(() => UserModel)
  @Index({ name: "idx_utm_sources_user_id" })
  @Column({ type: DataType.INTEGER, allowNull: false })
  userId!: number;

  @Column({ type: DataType.STRING(255), allowNull: true })
  utmSource?: string | null;

  @Column({ type: DataType.STRING(255), allowNull: true })
  utmCampaign?: string | null;

  @Column({ type: DataType.STRING(255), allowNull: true })
  utmMedium?: string | null;

  @Column({ type: DataType.JSONB, allowNull: true })
  metadata?: Record<string, unknown> | null;

  @CreatedAt
  @Column({ type: DataType.DATE })
  createdAt!: Date;

  @BelongsTo(() => UserModel)
  user!: UserModel;
}
