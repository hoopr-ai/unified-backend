import {
  Table, Column, Model, DataType, PrimaryKey, AutoIncrement,
  CreatedAt, UpdatedAt, ForeignKey, BelongsTo, Index,
} from "sequelize-typescript";
import { UserModel } from "../src/models/user.schema";
import type { RedemptionStatus } from "../src/enums/user.enum";

export interface UserRedemptionAttributes {
  id?: number;
  userId: number;
  amount: number;
  status: RedemptionStatus;
  createdAt?: Date;
  updatedAt?: Date;
}

@Table({ tableName: "user_redemptions", timestamps: true })
export class UserRedemptionModel extends Model<UserRedemptionModel, UserRedemptionAttributes> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.BIGINT)
  id!: number;

  @ForeignKey(() => UserModel)
  @Index({ name: "idx_user_redemption_user_id" })
  @Column({ type: DataType.INTEGER, allowNull: false })
  userId!: number;

  @Column({ type: DataType.DECIMAL(15, 2), allowNull: false })
  amount!: number;

  @Index({ name: "idx_user_redemption_status" })
  @Column({ type: DataType.STRING(20), allowNull: false })
  status!: RedemptionStatus;

  @CreatedAt
  @Column({ type: DataType.DATE })
  createdAt!: Date;

  @UpdatedAt
  @Column({ type: DataType.DATE })
  updatedAt!: Date;

  @BelongsTo(() => UserModel)
  user!: UserModel;
}
