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
import { TrialStatus } from "../../../dto-service/trial/trial.dto";

// One row per brand on the Smash 7-day trial — see scripts/create-smash-trial-tables.sql.
//
// Credits are kept per token type (creditsByType / creditsUsedByType, e.g.
// {"International": 1}), deliberately outside token_assigned so the trial never
// reads as a paid allocation. creditsTotal / creditsUsed are their sums, kept
// in the same UPDATE, for everything that only needs the totals.
// UNIQUE(emailDomain) is the hard "one trial per company domain" guarantee; the
// signup gate is only the friendly early rejection in front of it.
export interface BrandTrialAttributes {
  id?: number;
  brandId: number;
  startedByUserId: number;
  emailDomain: string;
  creditsTotal: number;
  creditsUsed?: number;
  creditsByType: Record<string, number>;
  creditsUsedByType?: Record<string, number>;
  startedAt: Date;
  endsAt: Date;
  // Set when creditsUsed reaches creditsTotal, cleared by an extension. Lets
  // the upgrade wall say which came first: credits running out, or day 7.
  creditsExhaustedAt?: Date | null;
  isExtended?: boolean;
  extendedAt?: Date | null;
  extendedById?: number | null;
  status?: TrialStatus;
  // First real use after onboarding; set once. Splits the journey's two lanes.
  activatedAt?: Date | null;
  // Day-7 outcome bucket (Day7Segment), written once when the window closes.
  day7Segment?: string | null;
  day7EvaluatedAt?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
}

@Table({ tableName: "brand_trials", timestamps: true })
export class BrandTrialModel extends Model<BrandTrialModel, BrandTrialAttributes> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  id!: number;

  @AllowNull(false)
  @Column({ type: DataType.BIGINT, field: "brandId", unique: true })
  brandId!: number;

  @AllowNull(false)
  @Column({ type: DataType.INTEGER, field: "startedByUserId" })
  startedByUserId!: number;

  @AllowNull(false)
  @Column({ type: DataType.STRING(255), field: "emailDomain", unique: true })
  emailDomain!: string;

  @AllowNull(false)
  @Column({ type: DataType.INTEGER, field: "creditsTotal" })
  creditsTotal!: number;

  @AllowNull(false)
  @Default(0)
  @Column({ type: DataType.INTEGER, field: "creditsUsed" })
  creditsUsed!: number;

  @AllowNull(false)
  @Default({})
  @Column({ type: DataType.JSONB, field: "creditsByType" })
  creditsByType!: Record<string, number>;

  @AllowNull(false)
  @Default({})
  @Column({ type: DataType.JSONB, field: "creditsUsedByType" })
  creditsUsedByType!: Record<string, number>;

  @AllowNull(false)
  @Column({ type: DataType.DATE, field: "startedAt" })
  startedAt!: Date;

  @AllowNull(false)
  @Column({ type: DataType.DATE, field: "endsAt" })
  endsAt!: Date;

  @AllowNull(true)
  @Column({ type: DataType.DATE, field: "creditsExhaustedAt" })
  creditsExhaustedAt?: Date | null;

  @AllowNull(false)
  @Default(false)
  @Column({ type: DataType.BOOLEAN, field: "isExtended" })
  isExtended!: boolean;

  @AllowNull(true)
  @Column({ type: DataType.DATE, field: "extendedAt" })
  extendedAt?: Date | null;

  @AllowNull(true)
  @Column({ type: DataType.INTEGER, field: "extendedById" })
  extendedById?: number | null;

  @AllowNull(false)
  @Default(TrialStatus.ACTIVE)
  @Column({ type: DataType.STRING(20), field: "status" })
  status!: TrialStatus;

  @AllowNull(true)
  @Column({ type: DataType.DATE, field: "activatedAt" })
  activatedAt?: Date | null;

  @AllowNull(true)
  @Column({ type: DataType.STRING(30), field: "day7Segment" })
  day7Segment?: string | null;

  @AllowNull(true)
  @Column({ type: DataType.DATE, field: "day7EvaluatedAt" })
  day7EvaluatedAt?: Date | null;

  @Column({ type: DataType.DATE, field: "createdAt" })
  createdAt!: Date;

  @Column({ type: DataType.DATE, field: "updatedAt" })
  updatedAt!: Date;
}
