import {
  Table,
  Column,
  Model,
  DataType,
  PrimaryKey,
  AutoIncrement,
  ForeignKey,
  BelongsTo,
  CreatedAt,
} from "sequelize-typescript";
import { OrderModel } from "./order.schema";
import { SkuModel } from "../../sku/schemas/sku.schema";

export interface OrderInfoAttributes {
  id?: number;
  orderId: number;
  skuId: string;
  qty: number;
  discount: number;
  sellingPrice: number;
  gstPercent: number;
  maxUsage: number;
  createdAt?: Date;
}

@Table({ tableName: "order_info", timestamps: false })
export class OrderInfoModel extends Model<OrderInfoModel, OrderInfoAttributes> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.BIGINT)
  id!: number;

  @ForeignKey(() => OrderModel)
  @Column({ type: DataType.BIGINT, allowNull: false })
  orderId!: number;

  @ForeignKey(() => SkuModel)
  @Column({ type: DataType.STRING(255), allowNull: false })
  skuId!: string;

  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 1 })
  qty!: number;

  @Column({ type: DataType.DOUBLE, allowNull: false, defaultValue: 0 })
  discount!: number;

  @Column({ type: DataType.DOUBLE, allowNull: false })
  sellingPrice!: number;

  @Column({ type: DataType.DOUBLE, allowNull: false, defaultValue: 18 })
  gstPercent!: number;

  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 1 })
  maxUsage!: number;

  @CreatedAt
  @Column({ type: DataType.DATE })
  createdAt!: Date;

  @BelongsTo(() => OrderModel)
  order!: OrderModel;

  @BelongsTo(() => SkuModel)
  sku!: SkuModel;
}
