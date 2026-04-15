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
  licensePdfPath?: string;
  projectId?: string;
  type?: string;
  price?: number;
  smashVisible?: boolean;
  tokenId?: number;
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

  @Column({
    type: DataType.STRING(500),
    allowNull: true,
  })
  licensePdfPath?: string;

  @Column({
    type: DataType.UUID,
    allowNull: true,
  })
  projectId?: string;

  @Column({
    type: DataType.STRING(100),
    allowNull: true,
  })
  type?: string;

  @Column({
    type: DataType.DECIMAL(10, 2),
    allowNull: true,
  })
  price?: number;

  @Column({
    type: DataType.BOOLEAN,
    allowNull: true,
    defaultValue: false,
  })
  smashVisible?: boolean;

  @Index({ name: "idx_licenses_token_id" })
  @Column({
    type: DataType.BIGINT,
    allowNull: true,
  })
  tokenId?: number;

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
