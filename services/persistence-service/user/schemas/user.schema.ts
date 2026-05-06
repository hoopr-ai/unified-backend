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
  HasMany,
} from "sequelize-typescript";
import type { UserStatus, AccountType } from "../../../dto-service/modules.export";
import { BrandModel } from "../../brand/schemas/modules.export";
import { UserRoleModel } from "./user-role.schema";

export interface UserDetails {
  id?: number;
  brandId?: number;
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
  status: UserStatus;
  mobile?: string;
  countryCode?: string;
  platform: string;
  accountType?: AccountType;
  profileRole?: string;
  emailVerified?: boolean;
  mobileVerified?: boolean;
  createdBy?: number;
  createdAt: Date;
  updatedAt?: Date;
  lastLoginAt?: Date | null;
  readonly isProfileComplete?: boolean;
}

@Table({
  tableName: "users",
  timestamps: true,
})
export class UserModel extends Model<UserModel, UserDetails> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
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

  @Index({ name: "unique_mobile_platform", unique: true })
  @Column({
    type: DataType.STRING(10),
    allowNull: true,
  })
  countryCode?: string;

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

  @Column({
    type: DataType.STRING(20),
    allowNull: true,
    defaultValue: "LABEL",
  })
  accountType?: AccountType;

  @Column({
    type: DataType.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  })
  emailVerified!: boolean;

  @Column({
    type: DataType.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  })
  mobileVerified!: boolean;

  get isProfileComplete(): boolean {
    return !!(this.firstName && this.lastName && this.mobile && this.countryCode && this.profileRole);
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

  @Column({
    type: DataType.DATE,
    allowNull: true,
  })
  lastLoginAt?: Date | null;

  @BelongsTo(() => BrandModel)
  brand?: BrandModel;

  @HasMany(() => UserRoleModel)
  userRoles?: UserRoleModel[];
}