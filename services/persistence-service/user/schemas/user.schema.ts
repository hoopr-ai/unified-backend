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
  ForeignKey,
  BelongsTo,
} from "sequelize-typescript";
import type { UserStatus } from "../../../dto-service/modules.export";
import { BrandModel } from "../../brand/schemas/modules.export";

export interface UserDetails {
  id?: number;
  brandId?: number;
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
  status: UserStatus;
  mobile?: string;
  platform: string;
  profileRole?: string;
  createdBy?: number;
  createdAt: Date;
  updatedAt?: Date;
  readonly isProfileComplete?: boolean;
}

@Table({
  tableName: "users",
  timestamps: true,
})
export class UserModel extends Model<UserModel, UserDetails> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.BIGINT)
  id!: number;

  @ForeignKey(() => BrandModel)
  @Column({
    type: DataType.BIGINT,
    allowNull: true,
  })
  brandId?: number;

  // Composite unique key: email + platform
  @Index({ name: "unique_email_platform", unique: true })
  @Column({
    type: DataType.STRING(255),
    allowNull: false,
  })
  email!: string;

  // Composite unique key: mobile + platform
  @Index({ name: "unique_mobile_platform", unique: true })
  @Column({
    type: DataType.STRING(100),
    allowNull: true,
  })
  mobile?: string;

  @Index({ name: "unique_email_platform", unique: true })
  @Index({ name: "unique_mobile_platform", unique: true })
  @Column({
    type: DataType.STRING(100),
    allowNull: false,
  })
  platform!: string;

  @Column({
    type: DataType.STRING(255),
    allowNull: false,
  })
  password!: string;

  @Column({
    type: DataType.STRING(255),
    allowNull: true,
  })
  firstName?: string;

  @Column({
    type: DataType.STRING(255),
    allowNull: true,
  })
  lastName?: string;

  @Column({
    type: DataType.STRING(100),
    allowNull: false,
  })
  status!: UserStatus;

  @Column({
    type: DataType.BIGINT,
    allowNull: true,
  })
  createdBy?: number;

  @Column({
    type: DataType.STRING(50),
    allowNull: true,
  })
  profileRole?: string;

  get isProfileComplete(): boolean {
    return !!(this.firstName && this.lastName && this.mobile && this.profileRole);
  }

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
  brand?: BrandModel;
}