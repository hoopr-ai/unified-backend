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
import { UserModel } from "./modules.export";
import type { AddressType } from "../../../dto-service/modules.export";

export interface UserAddressAttributes {
  id?: number;
  userId: number;
  addressType: AddressType;
  addressLine1: string;
  addressLine2?: string | null;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  pan?: string | null;
  gstin?: string | null;
  sameAsBusinessAddress?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

@Table({
  tableName: "user_addresses",
  timestamps: true,
})
export class UserAddressModel extends Model<UserAddressModel, UserAddressAttributes> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.BIGINT)
  id!: number;

  // Composite unique: one row per (userId, addressType)
  @ForeignKey(() => UserModel)
  @Index({ name: "unique_user_address_type", unique: true })
  @Column({ type: DataType.INTEGER, allowNull: false })
  userId!: number;

  @Index({ name: "unique_user_address_type", unique: true })
  @Column({ type: DataType.STRING(50), allowNull: false })
  addressType!: AddressType;

  @Column({ type: DataType.STRING(255), allowNull: false })
  addressLine1!: string;

  @Column({ type: DataType.STRING(255), allowNull: true })
  addressLine2?: string | null;

  @Column({ type: DataType.STRING(100), allowNull: false })
  city!: string;

  @Column({ type: DataType.STRING(100), allowNull: false })
  state!: string;

  @Column({ type: DataType.STRING(20), allowNull: false })
  postalCode!: string;

  @Column({ type: DataType.STRING(100), allowNull: false })
  country!: string;

  @Column({ type: DataType.TEXT, allowNull: true })
  pan?: string | null;

  @Column({ type: DataType.TEXT, allowNull: true })
  gstin?: string | null;

  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: false })
  sameAsBusinessAddress!: boolean;

  @CreatedAt
  @Column({ type: DataType.DATE })
  createdAt!: Date;

  @UpdatedAt
  @Column({ type: DataType.DATE })
  updatedAt!: Date;

  @BelongsTo(() => UserModel)
  user!: UserModel;
}
