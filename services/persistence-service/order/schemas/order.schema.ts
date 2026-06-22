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
import { UserModel } from "../../user/schemas/user.schema";
import { OrderInfoModel } from "./order-info.schema";

export enum OrderStatus {
  PENDING = "PENDING",
  SUCCESS = "SUCCESS",
  FAILED = "FAILED",
}

export interface OrderAttributes {
  id?: number;
  userId: number;
  totalDiscount: number;
  totalAmount: number;
  payAmount: number;
  status: OrderStatus;
  billingAddress?: object | null;
  createdAt?: Date;
  updatedAt?: Date;
}

@Table({ tableName: "orders", timestamps: true })
export class OrderModel extends Model<OrderModel, OrderAttributes> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.BIGINT)
  id!: number;

  @Index({ name: "idx_order_user_id" })
  @ForeignKey(() => UserModel)
  @Column({ type: DataType.INTEGER, allowNull: false })
  userId!: number;

  @Column({ type: DataType.DOUBLE, allowNull: false, defaultValue: 0 })
  totalDiscount!: number;

  @Column({ type: DataType.DOUBLE, allowNull: false })
  totalAmount!: number;

  @Column({ type: DataType.DOUBLE, allowNull: false })
  payAmount!: number;

  @Column({ type: DataType.STRING(20), allowNull: false, defaultValue: OrderStatus.PENDING })
  status!: OrderStatus;

  @Column({ type: DataType.JSONB, allowNull: true })
  billingAddress?: object | null;

  @CreatedAt
  @Column({ type: DataType.DATE })
  createdAt!: Date;

  @UpdatedAt
  @Column({ type: DataType.DATE })
  updatedAt!: Date;

  @BelongsTo(() => UserModel)
  user!: UserModel;

  @HasMany(() => OrderInfoModel)
  orderInfos!: OrderInfoModel[];
}
