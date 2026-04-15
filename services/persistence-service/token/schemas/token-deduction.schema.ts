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
import { TokenAssignedModel } from "./token-assigned.schema";

export enum TokenDeductionReason {
  LICENSE_PURCHASE = "LICENSE_PURCHASE",
  INTERNAL_DEDUCTION = "INTERNAL_DEDUCTION",
}

export interface TokenDeductionDetails {
  id?: number;
  tokenAssignedId: number;
  deductedTokenCount: number;
  reason: TokenDeductionReason;
  licenseId?: number;
  tokenHistoryId?: number; // Reference to original token_history entry (for migration traceability)
  deductedAt: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

@Table({
  tableName: "token_deduction",
  timestamps: true,
})
export class TokenDeductionModel extends Model<TokenDeductionModel, TokenDeductionDetails> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.BIGINT)
  id!: number;

  @Index({ name: "idx_token_deduction_token_assigned_id" })
  @ForeignKey(() => TokenAssignedModel)
  @Column({
    type: DataType.BIGINT,
    allowNull: false,
  })
  tokenAssignedId!: number;

  @Column({
    type: DataType.INTEGER,
    allowNull: false,
  })
  deductedTokenCount!: number;

  @Index({ name: "idx_token_deduction_reason" })
  @Column({
    type: DataType.ENUM(...Object.values(TokenDeductionReason)),
    allowNull: false,
  })
  reason!: TokenDeductionReason;

  @Index({ name: "idx_token_deduction_license_id" })
  @Column({
    type: DataType.BIGINT,
    allowNull: true,
  })
  licenseId?: number;

  @Column({
    type: DataType.BIGINT,
    allowNull: true,
  })
  tokenHistoryId?: number;

  @Column({
    type: DataType.DATE,
    allowNull: false,
  })
  deductedAt!: Date;

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

  @BelongsTo(() => TokenAssignedModel)
  tokenAssigned!: TokenAssignedModel;
}
