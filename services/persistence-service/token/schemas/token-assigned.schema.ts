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
  HasMany,
  Index,
} from "sequelize-typescript";
import { BrandModel } from "../../brand/schemas/modules.export";
import { UserModel } from "../../user/schemas/user.schema";
import { DealType } from "../../../dto-service/modules.export";

export interface TokenAssignedDetails {
  id?: number;
  totalAssignedToken: number;
  tokenBalance: number;
  expiryDate?: Date;
  brandId: number;
  type: string;
  ownerIds?: string[];
  tokenHistoryId?: number; // Reference to original token_history entry (for migration traceability)
  pricePerPack?: number | null;
  dealType?: DealType | null;
  iprsShare?: number | null;
  hooprShare?: number | null;
  keyName?: string | null;
  isUnlimited?: boolean;
  updatedById?: number | null;
  createdAt?: Date;
  updatedAt?: Date;
}

@Table({
  tableName: "token_assigned",
  timestamps: true,
})
export class TokenAssignedModel extends Model<TokenAssignedModel, TokenAssignedDetails> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.BIGINT)
  id!: number;

  @Column({
    type: DataType.INTEGER,
    allowNull: false,
    defaultValue: 0,
  })
  totalAssignedToken!: number;

  @Column({
    type: DataType.INTEGER,
    allowNull: false,
    defaultValue: 0,
  })
  tokenBalance!: number;

  @Column({
    type: DataType.DATE,
    allowNull: true,
  })
  expiryDate?: Date;

  @Index({ name: "idx_token_assigned_brand_id" })
  @ForeignKey(() => BrandModel)
  @Column({
    type: DataType.BIGINT,
    allowNull: false,
  })
  brandId!: number;

  @Index({ name: "idx_token_assigned_type" })
  @Column({
    type: DataType.STRING(255),
    allowNull: false,
  })
  type!: string;

  @Column({
    type: DataType.ARRAY(DataType.STRING),
    allowNull: true,
    defaultValue: [],
  })
  ownerIds?: string[];

  @Column({
    type: DataType.BIGINT,
    allowNull: true,
  })
  tokenHistoryId?: number;

  @Column({
    type: DataType.DECIMAL(12, 2),
    allowNull: true,
    get() {
      const value = this.getDataValue("pricePerPack");
      return value === null || value === undefined ? null : parseFloat(Number(value).toFixed(2));
    },
  })
  pricePerPack?: number | null;

  @Column({
    type: DataType.ENUM(...Object.values(DealType)),
    allowNull: true,
  })
  dealType?: DealType | null;

  @Column({
    type: DataType.DECIMAL(12, 2),
    allowNull: true,
    get() {
      const value = this.getDataValue("iprsShare");
      return value === null || value === undefined ? null : parseFloat(Number(value).toFixed(2));
    },
  })
  iprsShare?: number | null;

  @Column({
    type: DataType.DECIMAL(12, 2),
    allowNull: true,
    get() {
      const value = this.getDataValue("hooprShare");
      return value === null || value === undefined ? null : parseFloat(Number(value).toFixed(2));
    },
  })
  hooprShare?: number | null;

  @Column({
    type: DataType.STRING(255),
    allowNull: true,
  })
  keyName?: string | null;

  @Column({
    type: DataType.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  })
  isUnlimited!: boolean;

  @Index({ name: "idx_token_assigned_updated_by_id" })
  @ForeignKey(() => UserModel)
  @Column({
    type: DataType.INTEGER,
    allowNull: true,
  })
  updatedById?: number | null;

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

  @BelongsTo(() => BrandModel)
  brand!: BrandModel;
}
