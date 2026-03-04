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
import { StreamType } from "../../../dto-service/modules.export";
import { UserModel } from "./user.schema";
import { TrackModel } from "../../track/schemas/track.schema";

export interface UserStreamHistoryDetails {
  id?: number;
  userId?: number;
  trackCode: string;
  streamType: StreamType;
  platform?: string;
  count?: number;
  lastStreamedAt?: Date;
  createdAt?: Date;
}

@Table({
  tableName: "user_stream_history",
  timestamps: true,
  updatedAt: false,
})
export class UserStreamHistoryModel extends Model<UserStreamHistoryModel, UserStreamHistoryDetails> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.BIGINT)
  id!: number;

  @ForeignKey(() => UserModel)
  @Index({ name: "unique_user_track_stream", unique: true })
  @Column({
    type: DataType.BIGINT,
    allowNull: true,
  })
  userId?: number;

  @Index({ name: "unique_user_track_stream", unique: true })
  @Column({
    type: DataType.STRING(255),
    allowNull: false,
  })
  trackCode!: string;

  @Index({ name: "unique_user_track_stream", unique: true })
  @Column({
    type: DataType.STRING(20),
    allowNull: false,
    defaultValue: StreamType.PLAY,
  })
  streamType!: StreamType;

  @Column({
    type: DataType.INTEGER,
    allowNull: false,
    defaultValue: 1,
  })
  count!: number;

  @Column({
    type: DataType.DATE,
    allowNull: false,
  })
  lastStreamedAt!: Date;

  @Column({
    type: DataType.STRING(100),
    allowNull: true,
  })
  platform?: string;

  @CreatedAt
  @Column({
    type: DataType.DATE,
  })
  createdAt!: Date;

  @BelongsTo(() => UserModel, { foreignKey: "userId", constraints: false })
  user?: UserModel;

  @BelongsTo(() => TrackModel, { foreignKey: "trackCode", targetKey: "trackCode", constraints: false })
  track?: TrackModel;
}
