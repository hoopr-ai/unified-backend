import {
  Table,
  Column,
  Model,
  DataType,
  PrimaryKey,
  AutoIncrement,
  CreatedAt,
  UpdatedAt,
  ForeignKey,
  BelongsTo,
  Index,
} from "sequelize-typescript";
import { BrandModel } from "../../brand/schemas/modules.export";
import { UserModel } from "../../user/schemas/modules.export";
import { TrackModel } from "../../track/schemas/modules.export";

export interface DownloadDetails {
  id?: number;
  brandId: number;
  userId: number;
  trackId: string;
  tokenCost: number;
  downloadedAt: Date;
  createdAt: Date;
  updatedAt?: Date;
}

@Table({
  tableName: "downloads",
  timestamps: true,
})
export class DownloadModel extends Model<DownloadModel, DownloadDetails> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.BIGINT)
  id!: number;

  @Index({ name: "idx_downloads_brand_id" })
  @ForeignKey(() => BrandModel)
  @Column({
    type: DataType.BIGINT,
    allowNull: false,
  })
  brandId!: number;

  @Index({ name: "idx_downloads_user_id" })
  @ForeignKey(() => UserModel)
  @Column({
    type: DataType.BIGINT,
    allowNull: false,
  })
  userId!: number;

  @Index({ name: "idx_downloads_track_id" })
  @ForeignKey(() => TrackModel)
  @Column({
    type: DataType.UUID,
    allowNull: false,
  })
  trackId!: string;

  @Column({
    type: DataType.INTEGER,
    allowNull: false,
    defaultValue: 1,
  })
  tokenCost!: number;

  @Column({
    type: DataType.DATE,
    allowNull: false,
  })
  downloadedAt!: Date;

  @CreatedAt
  @Column({
    type: DataType.DATE,
  })
  createdAt!: Date;

  @UpdatedAt
  @Column({
    type: DataType.DATE,
    allowNull: true,
  })
  updatedAt?: Date;

  @BelongsTo(() => BrandModel)
  brand!: BrandModel;

  @BelongsTo(() => UserModel)
  user!: UserModel;

  @BelongsTo(() => TrackModel)
  track!: TrackModel;
}
