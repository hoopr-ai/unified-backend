import {
  Table,
  Column,
  Model,
  DataType,
  PrimaryKey,
  AutoIncrement,
  CreatedAt,
  ForeignKey,
  BelongsTo,
  Index,
} from "sequelize-typescript";
import { UserModel } from "../../user/schemas/user.schema";
import { SkuModel } from "../../sku/schemas/sku.schema";

export enum CartType {
  REGULAR = "C",
  BUY_NOW = "B",
}

export interface CartAttributes {
  id?: number;
  userId: number;
  skuId: string;
  cartType: CartType;
  qty: number;
  createdAt?: Date;
}

@Table({ tableName: "carts", timestamps: false })
export class CartModel extends Model<CartModel, CartAttributes> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.BIGINT)
  id!: number;

  @Index({ name: "idx_cart_user_id" })
  @ForeignKey(() => UserModel)
  @Column({ type: DataType.INTEGER, allowNull: false })
  userId!: number;

  @ForeignKey(() => SkuModel)
  @Column({ type: DataType.STRING(255), allowNull: false })
  skuId!: string;

  @Column({ type: DataType.STRING(1), allowNull: false })
  cartType!: CartType;

  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 1 })
  qty!: number;

  @CreatedAt
  @Column({ type: DataType.DATE })
  createdAt!: Date;

  @BelongsTo(() => SkuModel)
  sku!: SkuModel;

  @BelongsTo(() => UserModel)
  user!: UserModel;
}
