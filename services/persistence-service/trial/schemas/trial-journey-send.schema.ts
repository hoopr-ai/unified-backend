import {
  Table,
  Column,
  Model,
  DataType,
  PrimaryKey,
  AutoIncrement,
  AllowNull,
  Default,
} from "sequelize-typescript";
import { JourneySendStatus } from "../../../dto-service/trial/trial-journey.dto";

// One row per journey send — see scripts/create-smash-trial-tables.sql.
// UNIQUE(subjectKey, slot) is what holds the 3 email + 3 push budget: the row
// is inserted (claimed) before the provider is called.
export interface TrialJourneySendAttributes {
  id?: number;
  subjectKey: string;
  slot: string;
  brandId?: number | null;
  userId?: number | null;
  channel: string;
  variant?: string | null;
  status?: JourneySendStatus;
  providerMessageId?: string | null;
  title?: string | null;
  body?: string | null;
  url?: string | null;
  error?: string | null;
  sentAt?: Date | null;
  openedAt?: Date | null;
  clickedAt?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
}

@Table({ tableName: "trial_journey_sends", timestamps: true })
export class TrialJourneySendModel extends Model<
  TrialJourneySendModel,
  TrialJourneySendAttributes
> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  id!: number;

  @AllowNull(false)
  @Column({ type: DataType.STRING(320), field: "subjectKey" })
  subjectKey!: string;

  @AllowNull(false)
  @Column({ type: DataType.STRING(40), field: "slot" })
  slot!: string;

  @AllowNull(true)
  @Column({ type: DataType.BIGINT, field: "brandId" })
  brandId?: number | null;

  @AllowNull(true)
  @Column({ type: DataType.INTEGER, field: "userId" })
  userId?: number | null;

  @AllowNull(false)
  @Column({ type: DataType.STRING(20), field: "channel" })
  channel!: string;

  @AllowNull(true)
  @Column({ type: DataType.STRING(40), field: "variant" })
  variant?: string | null;

  @AllowNull(false)
  @Default(JourneySendStatus.PENDING)
  @Column({ type: DataType.STRING(20), field: "status" })
  status!: JourneySendStatus;

  @AllowNull(true)
  @Column({ type: DataType.STRING(255), field: "providerMessageId" })
  providerMessageId?: string | null;

  @AllowNull(true)
  @Column({ type: DataType.STRING(500), field: "title" })
  title?: string | null;

  @AllowNull(true)
  @Column({ type: DataType.TEXT, field: "body" })
  body?: string | null;

  @AllowNull(true)
  @Column({ type: DataType.TEXT, field: "url" })
  url?: string | null;

  @AllowNull(true)
  @Column({ type: DataType.TEXT, field: "error" })
  error?: string | null;

  @AllowNull(true)
  @Column({ type: DataType.DATE, field: "sentAt" })
  sentAt?: Date | null;

  @AllowNull(true)
  @Column({ type: DataType.DATE, field: "openedAt" })
  openedAt?: Date | null;

  @AllowNull(true)
  @Column({ type: DataType.DATE, field: "clickedAt" })
  clickedAt?: Date | null;

  @Column({ type: DataType.DATE, field: "createdAt" })
  createdAt!: Date;

  @Column({ type: DataType.DATE, field: "updatedAt" })
  updatedAt!: Date;
}
