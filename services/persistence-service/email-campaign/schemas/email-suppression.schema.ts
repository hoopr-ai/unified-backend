import {
  Table,
  Column,
  Model,
  DataType,
  PrimaryKey,
  Default,
  CreatedAt,
  UpdatedAt,
} from "sequelize-typescript";
import { EmailSuppressionReason } from "../../../dto-service/email-campaign/email-campaign.enum";

export interface EmailSuppressionDetails {
  id?: string;
  email: string;
  reason: EmailSuppressionReason;
  detail?: string | null;
  messageId?: string | null;
  createdBy?: number | null;
  createdAt?: Date;
  updatedAt?: Date;
}

@Table({
  tableName: "email_suppressions",
  timestamps: true,
  indexes: [{ unique: true, fields: ["email"] }],
})
export class EmailSuppressionModel extends Model<
  EmailSuppressionModel,
  EmailSuppressionDetails
> {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  id!: string;

  @Column({ type: DataType.STRING, allowNull: false })
  email!: string;

  @Column({
    type: DataType.ENUM(...Object.values(EmailSuppressionReason)),
    allowNull: false,
  })
  reason!: EmailSuppressionReason;

  // Human-readable context: bounce sub-type, complaint feedback type, or the
  // note an admin entered for a manual suppression.
  @Column({ type: DataType.TEXT, allowNull: true })
  detail?: string | null;

  @Column({ type: DataType.STRING, allowNull: true })
  messageId?: string | null;

  @Column({ type: DataType.BIGINT, allowNull: true })
  createdBy?: number | null;

  @CreatedAt
  @Column({ type: DataType.DATE, allowNull: false })
  createdAt!: Date;

  @UpdatedAt
  @Column({ type: DataType.DATE, allowNull: true })
  updatedAt?: Date;
}
