import {
  Table,
  Column,
  Model,
  DataType,
  PrimaryKey,
  Default,
  ForeignKey,
  CreatedAt,
  UpdatedAt,
  Index,
} from "sequelize-typescript";
import { EmailCampaignModel } from "./email-campaign.schema";
import { EmailRecipientStatus } from "../../../dto-service/email-campaign/email-campaign.enum";

export interface EmailCampaignRecipientDetails {
  id?: string;
  campaignId: string;
  // hoopr-backend users.id (UUID) for rows imported from the legacy system;
  // null for CSV-uploaded recipients.
  sourceUserId?: string | null;
  email: string;
  name?: string | null;
  status?: EmailRecipientStatus;
  attempts?: number;
  messageId?: string | null;
  error?: string | null;
  sentAt?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
}

@Table({
  tableName: "email_campaign_recipients",
  timestamps: true,
  indexes: [
    { fields: ["campaignId", "status"] },
    { fields: ["status", "sentAt"] },
    { fields: ["messageId"] },
    { unique: true, fields: ["campaignId", "email"] },
  ],
})
export class EmailCampaignRecipientModel extends Model<
  EmailCampaignRecipientModel,
  EmailCampaignRecipientDetails
> {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  id!: string;

  @ForeignKey(() => EmailCampaignModel)
  @Column({ type: DataType.UUID, allowNull: false })
  campaignId!: string;

  @Column({ type: DataType.STRING, allowNull: true })
  sourceUserId?: string | null;

  @Column({ type: DataType.STRING, allowNull: false })
  email!: string;

  @Column({ type: DataType.STRING, allowNull: true })
  name?: string | null;

  @Default(EmailRecipientStatus.PENDING)
  @Column({
    type: DataType.ENUM(...Object.values(EmailRecipientStatus)),
    allowNull: false,
  })
  status!: EmailRecipientStatus;

  @Default(0)
  @Column({ type: DataType.INTEGER, allowNull: false })
  attempts!: number;

  @Column({ type: DataType.STRING, allowNull: true })
  messageId?: string | null;

  @Column({ type: DataType.TEXT, allowNull: true })
  error?: string | null;

  @Column({ type: DataType.DATE, allowNull: true })
  sentAt?: Date | null;

  @CreatedAt
  @Column({ type: DataType.DATE, allowNull: false })
  createdAt!: Date;

  @UpdatedAt
  @Column({ type: DataType.DATE, allowNull: true })
  updatedAt?: Date;
}
