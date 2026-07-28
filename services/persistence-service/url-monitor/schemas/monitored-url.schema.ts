import {
  Table,
  Column,
  Model,
  DataType,
  PrimaryKey,
  AutoIncrement,
  CreatedAt,
  UpdatedAt,
} from "sequelize-typescript";

export type MonitorStatus = "UP" | "DOWN" | "PENDING";

export interface MonitoredUrlDetails {
  id?: number;
  name: string;
  url: string;
  isActive?: boolean;
  notifyEmails?: string[];
  sslAlertDays?: number;
  lastStatus?: MonitorStatus;
  lastStatusCode?: number | null;
  lastResponseTimeMs?: number | null;
  lastError?: string | null;
  lastCheckedAt?: Date | null;
  downSince?: Date | null;
  sslExpiresAt?: Date | null;
  sslDaysRemaining?: number | null;
  sslIssuer?: string | null;
  sslError?: string | null;
  lastDownAlertAt?: Date | null;
  lastSslAlertAt?: Date | null;
  createdBy?: number | null;
  createdAt?: Date;
  updatedAt?: Date;
}

@Table({
  tableName: "monitored_urls",
  timestamps: true,
})
export class MonitoredUrlModel extends Model<MonitoredUrlModel, MonitoredUrlDetails> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.BIGINT)
  id!: number;

  @Column({
    type: DataType.STRING(255),
    allowNull: false,
  })
  name!: string;

  @Column({
    type: DataType.STRING(1024),
    allowNull: false,
  })
  url!: string;

  @Column({
    type: DataType.BOOLEAN,
    allowNull: false,
    defaultValue: true,
  })
  isActive!: boolean;

  // Alert recipients for this URL. Empty array falls back to the
  // URL_MONITOR_ALERT_EMAILS env default at send time.
  @Column({
    type: DataType.JSONB,
    allowNull: false,
    defaultValue: [],
  })
  notifyEmails!: string[];

  // Start alerting when the SSL cert has <= this many days left.
  @Column({
    type: DataType.INTEGER,
    allowNull: false,
    defaultValue: 30,
  })
  sslAlertDays!: number;

  @Column({
    type: DataType.STRING(20),
    allowNull: false,
    defaultValue: "PENDING",
  })
  lastStatus!: MonitorStatus;

  @Column({
    type: DataType.INTEGER,
    allowNull: true,
  })
  lastStatusCode?: number | null;

  @Column({
    type: DataType.INTEGER,
    allowNull: true,
  })
  lastResponseTimeMs?: number | null;

  @Column({
    type: DataType.STRING(512),
    allowNull: true,
  })
  lastError?: string | null;

  @Column({
    type: DataType.DATE,
    allowNull: true,
  })
  lastCheckedAt?: Date | null;

  @Column({
    type: DataType.DATE,
    allowNull: true,
  })
  downSince?: Date | null;

  @Column({
    type: DataType.DATE,
    allowNull: true,
  })
  sslExpiresAt?: Date | null;

  @Column({
    type: DataType.INTEGER,
    allowNull: true,
  })
  sslDaysRemaining?: number | null;

  @Column({
    type: DataType.STRING(255),
    allowNull: true,
  })
  sslIssuer?: string | null;

  @Column({
    type: DataType.STRING(512),
    allowNull: true,
  })
  sslError?: string | null;

  // Alert throttling stamps — when the last down/SSL email went out.
  @Column({
    type: DataType.DATE,
    allowNull: true,
  })
  lastDownAlertAt?: Date | null;

  @Column({
    type: DataType.DATE,
    allowNull: true,
  })
  lastSslAlertAt?: Date | null;

  @Column({
    type: DataType.BIGINT,
    allowNull: true,
  })
  createdBy?: number | null;

  @CreatedAt
  @Column({
    type: DataType.DATE,
  })
  createdAt!: Date;

  @UpdatedAt
  @Column({
    type: DataType.DATE,
  })
  updatedAt!: Date;
}
