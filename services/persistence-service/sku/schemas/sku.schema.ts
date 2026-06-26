import {
  Table,
  Column,
  Model,
  DataType,
  PrimaryKey,
  CreatedAt,
  UpdatedAt,
  Index,
  Default,
  BelongsTo,
} from "sequelize-typescript";
import { TrackModel } from "../../track/schemas/track.schema";

export enum ItemType {
  TRACK = "T",
  PACK = "P",
}

export interface SkuDetails {
  id: string;
  trackCode: string;
  itemType: string;
  costPrice?: number;
  sellingPrice?: number;
  gstPercent?: number;
  maxUsage: number;
  description?: string;
  createdAt: Date;
  updatedAt?: Date;
}

@Table({
  tableName: "SKUs",
  timestamps: true,
})
export class SkuModel extends Model<SkuModel, SkuDetails> {
  @PrimaryKey
  @Column({
    type: DataType.STRING(255),
    allowNull: false,
  })
  id!: string;

  @Index
  @Column({
    type: DataType.STRING(36),
    allowNull: false,
    field: "trackCode",
  })
  trackCode!: string;

  @Column({
    type: DataType.STRING(20),
    allowNull: false,
  })
  itemType!: string;

  @Column({
    type: DataType.DOUBLE,
    allowNull: true,
  })
  costPrice?: number;

  @Column({
    type: DataType.DOUBLE,
    allowNull: true,
  })
  sellingPrice?: number;

  @Default(18)
  @Column({
    type: DataType.DOUBLE,
    allowNull: true,
  })
  gstPercent?: number;

  @Default(3)
  @Column({
    type: DataType.INTEGER,
    allowNull: false,
  })
  maxUsage!: number;

  @Column({
    type: DataType.STRING(255),
    allowNull: true,
  })
  description?: string;

  @CreatedAt
  @Column({
    type: DataType.DATE,
    allowNull: false,
  })
  createdAt!: Date;

  @UpdatedAt
  @Column({
    type: DataType.DATE,
    allowNull: true,
  })
  updatedAt?: Date;

  // Association with Track
  @BelongsTo(() => TrackModel, { foreignKey: "trackCode", targetKey: "trackCode", constraints: false })
  track?: TrackModel;
}
