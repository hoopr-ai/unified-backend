import {
  Table,
  Column,
  Model,
  DataType,
  PrimaryKey,
  AutoIncrement,
  CreatedAt,
  Index,
  ForeignKey,
  BelongsTo,
} from "sequelize-typescript";
import { UserModel } from "./user.schema";
import { TrackModel } from "../../track/schemas/track.schema";

export interface UserLikedTrackDetails {
  id?: number;
  userId: number;
  trackCode: string;
  createdAt?: Date;
}

@Table({
  tableName: "user_liked_tracks",
  timestamps: true,
  updatedAt: false,
})
export class UserLikedTrackModel extends Model<UserLikedTrackModel, UserLikedTrackDetails> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.BIGINT)
  id!: number;

  @ForeignKey(() => UserModel)
  @Index({ name: "unique_user_track", unique: true })
  @Column({
    type: DataType.BIGINT,
    allowNull: false,
  })
  userId!: number;

  @Index({ name: "unique_user_track", unique: true })
  @Column({
    type: DataType.STRING(255),
    allowNull: false,
  })
  trackCode!: string;

  @CreatedAt
  @Column({
    type: DataType.DATE,
  })
  createdAt!: Date;

  @BelongsTo(() => UserModel)
  user?: UserModel;

  @BelongsTo(() => TrackModel, { foreignKey: "trackCode", targetKey: "trackCode", constraints: false })
  track?: TrackModel;
}
