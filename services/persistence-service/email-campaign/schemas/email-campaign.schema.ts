import {
  Table,
  Column,
  Model,
  DataType,
  PrimaryKey,
  Default,
  CreatedAt,
  UpdatedAt,
  DeletedAt,
} from "sequelize-typescript";
import { EmailCampaignStatus } from "../../../dto-service/email-campaign/email-campaign.enum";

export interface EmailCampaignDetails {
  id?: string;
  name: string;
  subject: string;
  html: string;
  templateId?: string | null;
  status?: EmailCampaignStatus;
  totalRecipients?: number;
  // Deliberately below the SES account limits (50,000/day, 14/sec) so
  // transactional mail keeps headroom.
  dailyQuota?: number;
  ratePerSec?: number;
  batchSize?: number;
  maxAttempts?: number;
  lockedAt?: Date | null;
  startedAt?: Date | null;
  completedAt?: Date | null;
  createdBy?: number | null;
  createdAt?: Date;
  updatedAt?: Date;
  deletedAt?: Date | null;
}

@Table({ tableName: "email_campaigns", timestamps: true, paranoid: true })
export class EmailCampaignModel extends Model<EmailCampaignModel, EmailCampaignDetails> {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  id!: string;

  @Column({ type: DataType.STRING, allowNull: false })
  name!: string;

  @Column({ type: DataType.STRING, allowNull: false })
  subject!: string;

  @Column({ type: DataType.TEXT, allowNull: false })
  html!: string;

  @Column({ type: DataType.UUID, allowNull: true })
  templateId?: string | null;

  @Default(EmailCampaignStatus.DRAFT)
  @Column({
    type: DataType.ENUM(...Object.values(EmailCampaignStatus)),
    allowNull: false,
  })
  status!: EmailCampaignStatus;

  @Default(0)
  @Column({ type: DataType.INTEGER, allowNull: false })
  totalRecipients!: number;

  @Default(45000)
  @Column({ type: DataType.INTEGER, allowNull: false })
  dailyQuota!: number;

  @Default(10)
  @Column({ type: DataType.INTEGER, allowNull: false })
  ratePerSec!: number;

  @Default(500)
  @Column({ type: DataType.INTEGER, allowNull: false })
  batchSize!: number;

  @Default(2)
  @Column({ type: DataType.INTEGER, allowNull: false })
  maxAttempts!: number;

  // Concurrency lock held by the batch worker (see claimCampaignLock).
  @Column({ type: DataType.DATE, allowNull: true })
  lockedAt?: Date | null;

  @Column({ type: DataType.DATE, allowNull: true })
  startedAt?: Date | null;

  @Column({ type: DataType.DATE, allowNull: true })
  completedAt?: Date | null;

  @Column({ type: DataType.BIGINT, allowNull: true })
  createdBy?: number | null;

  @CreatedAt
  @Column({ type: DataType.DATE, allowNull: false })
  createdAt!: Date;

  @UpdatedAt
  @Column({ type: DataType.DATE, allowNull: true })
  updatedAt?: Date;

  @DeletedAt
  @Column({ type: DataType.DATE, allowNull: true })
  deletedAt?: Date | null;
}
