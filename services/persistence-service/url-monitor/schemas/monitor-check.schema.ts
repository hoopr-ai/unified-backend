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

export interface MonitorCheckDetails {
  id?: number;
  urlId: number;
  status: "UP" | "DOWN";
  statusCode?: number | null;
  responseTimeMs?: number | null;
  error?: string | null;
  checkedAt: Date;
  createdAt?: Date;
}

// One row per health check — powers the uptime/response-time history on the
// dashboard. Pruned to the last 30 days by the monitor job.
@Table({
  tableName: "monitor_checks",
  timestamps: true,
  updatedAt: false,
})
export class MonitorCheckModel extends Model<MonitorCheckModel, MonitorCheckDetails> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.BIGINT)
  id!: number;

  @Index("monitor_checks_url_id_checked_at")
  @Column({
    type: DataType.BIGINT,
    allowNull: false,
  })
  urlId!: number;

  @Column({
    type: DataType.STRING(10),
    allowNull: false,
  })
  status!: "UP" | "DOWN";

  @Column({
    type: DataType.INTEGER,
    allowNull: true,
  })
  statusCode?: number | null;

  @Column({
    type: DataType.INTEGER,
    allowNull: true,
  })
  responseTimeMs?: number | null;

  @Column({
    type: DataType.STRING(512),
    allowNull: true,
  })
  error?: string | null;

  @Index("monitor_checks_url_id_checked_at")
  @Column({
    type: DataType.DATE,
    allowNull: false,
  })
  checkedAt!: Date;

  @CreatedAt
  @Column({
    type: DataType.DATE,
  })
  createdAt!: Date;
}
