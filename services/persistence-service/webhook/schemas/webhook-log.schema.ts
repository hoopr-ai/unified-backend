import {
  Table,
  Column,
  Model,
  DataType,
  PrimaryKey,
  AutoIncrement,
  CreatedAt,
  Index,
} from "sequelize-typescript";

export interface WebhookLogAttributes {
  id?: number;
  provider: string;
  eventId?: string | null;
  eventType?: string | null;
  razorpayOrderId?: string | null;
  razorpayPaymentId?: string | null;
  signatureValid: boolean;
  handled?: boolean | null;
  result?: string | null;
  error?: string | null;
  payload?: object | null;
  createdAt?: Date;
}

// Audit log of every webhook delivery we receive — one row per HTTP hit,
// including invalid-signature and failed deliveries, so "did Razorpay call
// us and what did we do?" is answerable from the DB alone.
@Table({ tableName: "webhook_logs", timestamps: true, updatedAt: false })
export class WebhookLogModel extends Model<WebhookLogModel, WebhookLogAttributes> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.BIGINT)
  id!: number;

  @Column({ type: DataType.STRING(50), allowNull: false, defaultValue: "razorpay" })
  provider!: string;

  // x-razorpay-event-id header — unique per event, useful for dedupe/tracing
  @Index({ name: "idx_webhook_log_event_id" })
  @Column({ type: DataType.STRING(255), allowNull: true })
  eventId?: string | null;

  @Column({ type: DataType.STRING(100), allowNull: true })
  eventType?: string | null;

  @Index({ name: "idx_webhook_log_rzp_order_id" })
  @Column({ type: DataType.STRING(255), allowNull: true })
  razorpayOrderId?: string | null;

  @Column({ type: DataType.STRING(255), allowNull: true })
  razorpayPaymentId?: string | null;

  @Column({ type: DataType.BOOLEAN, allowNull: false })
  signatureValid!: boolean;

  // Outcome of handleRazorpayWebhookService; null when processing threw
  @Column({ type: DataType.BOOLEAN, allowNull: true })
  handled?: boolean | null;

  @Column({ type: DataType.STRING(255), allowNull: true })
  result?: string | null;

  @Column({ type: DataType.TEXT, allowNull: true })
  error?: string | null;

  @Column({ type: DataType.JSONB, allowNull: true })
  payload?: object | null;

  @CreatedAt
  @Column({ type: DataType.DATE })
  createdAt!: Date;
}
