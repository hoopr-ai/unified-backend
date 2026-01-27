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
import { UserModel } from "./modules.export";
import type { SessionStatus } from "../../../dto-service/modules.export";

export interface UserSessionDetails {
  id?: number;
  userId: number;
  sessionToken: string;
  ipAddress?: string;
  userAgent?: string;
  deviceType?: string;
  browser?: string;
  os?: string;
  status: SessionStatus;
  lastActivityAt: Date;
  expiresAt: Date;
  createdAt: Date;
  updatedAt?: Date;
}

@Table({
  tableName: "user_sessions",
  timestamps: true,
})
export class UserSessionModel extends Model<UserSessionModel, UserSessionDetails> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.BIGINT)
  id!: number;

  @ForeignKey(() => UserModel)
  @Index({ name: "idx_session_user_id" })
  @Column({
    type: DataType.BIGINT,
    allowNull: false,
  })
  userId!: number;

  @Index({ name: "idx_session_token", unique: true })
  @Column({
    type: DataType.STRING(500),
    allowNull: false,
  })
  sessionToken!: string;

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

  @Index({ name: "idx_session_status" })
  @Column({
    type: DataType.STRING(50),
    allowNull: false,
  })
  status!: SessionStatus;

  @Index({ name: "idx_session_last_activity" })
  @Column({
    type: DataType.DATE,
    allowNull: false,
  })
  lastActivityAt!: Date;

  @Column({
    type: DataType.DATE,
    allowNull: false,
  })
  expiresAt!: Date;

  @CreatedAt
  @Column({
    type: DataType.DATE,
  })
  createdAt!: Date;

  @UpdatedAt
  @Column({
    type: DataType.DATE,
    allowNull: true,
  })
  updatedAt?: Date;

  @BelongsTo(() => UserModel)
  user!: UserModel;
}
