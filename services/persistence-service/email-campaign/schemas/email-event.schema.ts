import {
  Table,
  Column,
  Model,
  DataType,
  PrimaryKey,
  Default,
  CreatedAt,
} from "sequelize-typescript";
import { EmailEventType } from "../../../dto-service/email-campaign/email-campaign.enum";

// Raw SES delivery events (bounce/complaint) received via the SNS webhook.
// campaignId is resolved from the recipient row matching the SES messageId,
// when one exists (transactional mail also flows through the same topic).
export interface EmailEventDetails {
  id?: string;
  type: EmailEventType;
  email: string;
  messageId?: string | null;
  campaignId?: string | null;
  detail?: string | null;
  payload?: object | null;
  createdAt?: Date;
}

@Table({
  tableName: "email_events",
  timestamps: true,
  updatedAt: false,
  indexes: [{ fields: ["messageId"] }, { fields: ["campaignId", "type"] }],
})
export class EmailEventModel extends Model<EmailEventModel, EmailEventDetails> {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  id!: string;

  @Column({
    type: DataType.ENUM(...Object.values(EmailEventType)),
    allowNull: false,
  })
  type!: EmailEventType;

  @Column({ type: DataType.STRING, allowNull: false })
  email!: string;

  @Column({ type: DataType.STRING, allowNull: true })
  messageId?: string | null;

  @Column({ type: DataType.UUID, allowNull: true })
  campaignId?: string | null;

  @Column({ type: DataType.TEXT, allowNull: true })
  detail?: string | null;

  @Column({ type: DataType.JSONB, allowNull: true })
  payload?: object | null;

  @CreatedAt
  @Column({ type: DataType.DATE, allowNull: false })
  createdAt!: Date;
}
