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
  HasMany,
  Index,
} from "sequelize-typescript";
import { BrandModel } from "../../brand/schemas/modules.export";
import { UserModel } from "../../user/schemas/modules.export";
import { TrackModel } from "../../track/schemas/modules.export";
import { LicenseTypeModel } from "./licenseType.schema";
import { VideoLinkModel } from "./videoLinks.schema";

export interface LicenseDetails {
  id?: number;
  brandId: number;
  userId: number;
  trackCode: string;
  tokenCost: number;
  licensedAt: Date;
  status?: string;
  licenseTypeId?: string;
  createdAt: Date;
  updatedAt?: Date;
}

@Table({
  tableName: "licenses",
  timestamps: true,
})
export class LicenseModel extends Model<LicenseModel, LicenseDetails> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.BIGINT)
  id!: number;

  @Index({ name: "idx_licenses_brand_id" })
  @ForeignKey(() => BrandModel)
  @Column({
    type: DataType.BIGINT,
    allowNull: false,
  })
  brandId!: number;

  @Index({ name: "idx_licenses_user_id" })
  @ForeignKey(() => UserModel)
  @Column({
    type: DataType.BIGINT,
    allowNull: false,
  })
  userId!: number;

  @ForeignKey(() => TrackModel)
  @Column({
    type: DataType.STRING(100),
    allowNull: false,
  })
  trackCode!: string;

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
  licensedAt!: Date;

  @Column({
    type: DataType.STRING(50),
    allowNull: true,
  })
  status?: string;

  @Index({ name: "idx_licenses_license_type_id" })
  @ForeignKey(() => LicenseTypeModel)
  @Column({
    type: DataType.UUID,
    allowNull: true,
  })
  licenseTypeId?: string;

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

  @BelongsTo(() => TrackModel, { foreignKey: "trackCode", targetKey: "trackCode" })
  track!: TrackModel;

  @BelongsTo(() => LicenseTypeModel)
  licenseType?: LicenseTypeModel;

  @HasMany(() => VideoLinkModel)
  videoLinks!: VideoLinkModel[];
}
