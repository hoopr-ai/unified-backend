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
import { BrandModel } from "../../brand/schemas/modules.export";
import { TokenModel } from "./token.schema";

export interface TokenHistoryDetails {
  id?: number;
  tokenId: number;
  brandId: number;
  type: string;
  assignedAmount: number;
  expiryDate?: Date;
  ownerIds?: string[];
  createdAt?: Date;
  updatedAt?: Date;
}

@Table({
  tableName: "token_history",
  timestamps: true,
})
export class TokenHistoryModel extends Model<TokenHistoryModel, TokenHistoryDetails> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.BIGINT)
  id!: number;

  @ForeignKey(() => TokenModel)
  @Index({ name: "idx_token_history_token_id" })
  @Column({
    type: DataType.BIGINT,
    allowNull: false,
  })
  tokenId!: number;

  @Index({ name: "idx_token_history_brand_id" })
  @ForeignKey(() => BrandModel)
  @Column({
    type: DataType.BIGINT,
    allowNull: false,
  })
  brandId!: number;

  @Index({ name: "idx_token_history_type" })
  @Column({
    type: DataType.STRING(255),
    allowNull: false,
  })
  type!: string;

  @Column({
    type: DataType.INTEGER,
    allowNull: false,
  })
  assignedAmount!: number;

  @Column({
    type: DataType.DATE,
    allowNull: true,
  })
  expiryDate?: Date;

  @Column({
    type: DataType.ARRAY(DataType.STRING),
    allowNull: true,
    defaultValue: [],
  })
  ownerIds?: string[];

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

  @BelongsTo(() => TokenModel)
  token!: TokenModel;

  @BelongsTo(() => BrandModel)
  brand!: BrandModel;
}
