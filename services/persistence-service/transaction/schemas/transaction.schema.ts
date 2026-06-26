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
import { UserModel } from "../../user/schemas/user.schema";
import { OrderModel } from "../../order/schemas/order.schema";

export enum TransactionStatus {
  INITIATED = "I",
  SUCCESS = "S",
  FAILED = "F",
}

export enum PaymentMethod {
  UPI = "UPI",
  CARD = "Card",
  NETBANKING = "Netbanking",
  WALLET = "Wallet",
  OTHER = "Other",
}

export interface TransactionAttributes {
  id?: number;
  orderId: number;
  userId: number;
  totalDiscount: number;
  totalAmount: number;
  payAmount: number;
  status: TransactionStatus;
  paymentResponse?: object | null;
  paymentMethod?: string | null;
  razorpayOrderId?: string | null;
  razorpayPaymentId?: string | null;
  email?: string | null;
  billingAddress?: object | null;
  createdAt?: Date;
  updatedAt?: Date;
}

@Table({ tableName: "transactions", timestamps: true })
export class TransactionModel extends Model<TransactionModel, TransactionAttributes> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.BIGINT)
  id!: number;

  @Index({ name: "idx_transaction_order_id" })
  @ForeignKey(() => OrderModel)
  @Column({ type: DataType.BIGINT, allowNull: false })
  orderId!: number;

  @Index({ name: "idx_transaction_user_id" })
  @ForeignKey(() => UserModel)
  @Column({ type: DataType.INTEGER, allowNull: false })
  userId!: number;

  @Column({ type: DataType.DOUBLE, allowNull: false, defaultValue: 0 })
  totalDiscount!: number;

  @Column({ type: DataType.DOUBLE, allowNull: false })
  totalAmount!: number;

  @Column({ type: DataType.DOUBLE, allowNull: false })
  payAmount!: number;

  @Column({ type: DataType.STRING(1), allowNull: false, defaultValue: TransactionStatus.INITIATED })
  status!: TransactionStatus;

  @Column({ type: DataType.JSONB, allowNull: true })
  paymentResponse?: object | null;

  @Column({ type: DataType.STRING(50), allowNull: true })
  paymentMethod?: string | null;

  @Column({ type: DataType.STRING(255), allowNull: true })
  razorpayOrderId?: string | null;

  @Column({ type: DataType.STRING(255), allowNull: true })
  razorpayPaymentId?: string | null;

  @Column({ type: DataType.STRING(255), allowNull: true })
  email?: string | null;

  @Column({ type: DataType.JSONB, allowNull: true })
  billingAddress?: object | null;

  @CreatedAt
  @Column({ type: DataType.DATE })
  createdAt!: Date;

  @UpdatedAt
  @Column({ type: DataType.DATE })
  updatedAt!: Date;

  @BelongsTo(() => OrderModel)
  order!: OrderModel;

  @BelongsTo(() => UserModel)
  user!: UserModel;
}
