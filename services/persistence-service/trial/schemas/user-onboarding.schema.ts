import {
  Table,
  Column,
  Model,
  DataType,
  PrimaryKey,
  AllowNull,
} from "sequelize-typescript";

// Smash onboarding answers, captured at complete-profile. One row per user,
// kept off the shared users table (same reasoning as user_tour_seen). Both
// columns drive message personalisation, so they are real columns, not a JSON
// blob: `WHERE 'hoopr_og' = ANY("categoryPreferences")` is GIN-indexed.
export interface UserOnboardingAttributes {
  userId: number;
  categoryPreferences: string[];
  discoveryChannel?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}

@Table({ tableName: "user_onboarding", timestamps: true })
export class UserOnboardingModel extends Model<
  UserOnboardingModel,
  UserOnboardingAttributes
> {
  @PrimaryKey
  @Column({ type: DataType.INTEGER, field: "userId" })
  userId!: number;

  @AllowNull(false)
  @Column({ type: DataType.ARRAY(DataType.STRING(40)), field: "categoryPreferences" })
  categoryPreferences!: string[];

  @AllowNull(true)
  @Column({ type: DataType.STRING(40), field: "discoveryChannel" })
  discoveryChannel?: string | null;

  @Column({ type: DataType.DATE, field: "createdAt" })
  createdAt!: Date;

  @Column({ type: DataType.DATE, field: "updatedAt" })
  updatedAt!: Date;
}
