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
import { UserModel } from "./modules.export";
import { UserSessionModel } from "./user-session.schema";

export interface UserActivityDetails {
  id?: number;
  userId: number;
  sessionId: number;
  action: string;
  endpoint: string;
  method: string;
  statusCode?: number;
  ipAddress?: string;
  userAgent?: string;
  deviceType?: string;
  browser?: string;
  os?: string;
  metadata?: Record<string, unknown>;
  requestBody?: Record<string, unknown>;
  responseTime?: number;
  createdAt: Date;
}

@Table({
  tableName: "user_activities",
  timestamps: false,
})
export class UserActivityModel extends Model<UserActivityModel, UserActivityDetails> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.BIGINT)
  id!: number;

  @ForeignKey(() => UserModel)
  @Index({ name: "idx_activity_user_id" })
  @Column({
    type: DataType.BIGINT,
    allowNull: false,
  })
  userId!: number;

  @ForeignKey(() => UserSessionModel)
  @Index({ name: "idx_activity_session_id" })
  @Column({
    type: DataType.BIGINT,
    allowNull: false,
  })
  sessionId!: number;

  @Index({ name: "idx_activity_action" })
  @Column({
    type: DataType.STRING(100),
    allowNull: false,
  })
  action!: string;

  @Index({ name: "idx_activity_endpoint" })
  @Column({
    type: DataType.STRING(500),
    allowNull: false,
  })
  endpoint!: string;

  @Column({
    type: DataType.STRING(20),
    allowNull: false,
  })
  method!: string;

  @Column({
    type: DataType.INTEGER,
    allowNull: true,
  })
  statusCode?: number;

  @Column({
    type: DataType.STRING(100),
    allowNull: true,
  })
  ipAddress?: string;

  @Column({
    type: DataType.STRING(500),
    allowNull: true,
  })
  userAgent?: string;

  @Column({
    type: DataType.STRING(50),
    allowNull: true,
  })
  deviceType?: string;

  @Column({
    type: DataType.STRING(100),
    allowNull: true,
  })
  browser?: string;

  @Column({
    type: DataType.STRING(100),
    allowNull: true,
  })
  os?: string;

  @Column({
    type: DataType.JSONB,
    allowNull: true,
  })
  metadata?: Record<string, unknown>;

  @Column({
    type: DataType.JSONB,
    allowNull: true,
  })
  requestBody?: Record<string, unknown>;

  @Column({
    type: DataType.INTEGER,
    allowNull: true,
  })
  responseTime?: number;

  @CreatedAt
  @Index({ name: "idx_activity_created_at" })
  @Column({
    type: DataType.DATE,
  })
  createdAt!: Date;

  @BelongsTo(() => UserModel)
  user!: UserModel;

  @BelongsTo(() => UserSessionModel)
  session!: UserSessionModel;
}
