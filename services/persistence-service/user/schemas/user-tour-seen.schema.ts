import {
  Table,
  Column,
  Model,
  DataType,
  PrimaryKey,
  AutoIncrement,
  AllowNull,
  Index,
} from "sequelize-typescript";

// One row per (userId, tour) a user has seen — the row's presence IS the seen
// flag. The table is shared with studio-backend-ts (same database), which
// created it; smash tours use their own keys, and userIds never collide because
// both read the shared users table. Kept off the users table on purpose so
// onboarding state does not couple to the unified user schema.
export interface UserTourSeenAttributes {
  id?: number;
  userId: number;
  tour: string;
  seenAt?: Date; // DB default NOW() — set once, never updated
}

@Table({ tableName: "user_tour_seen", timestamps: false })
export class UserTourSeenModel extends Model<
  UserTourSeenModel,
  UserTourSeenAttributes
> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  id!: number;

  @AllowNull(false)
  @Index
  @Column({ type: DataType.INTEGER, field: "userId" })
  userId!: number;

  @AllowNull(false)
  @Column({ type: DataType.STRING(60), field: "tour" })
  tour!: string;

  // Filled by the DB default on insert; the model never writes it.
  @AllowNull(true)
  @Column({ type: DataType.DATE, field: "seenAt" })
  seenAt?: Date;
}
