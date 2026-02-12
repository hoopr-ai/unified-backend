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
import { OwnerType } from "../../owner/schemas/owner.schema";

export interface TokenDetails {
  id?: number;
  totalAssignedToken: number;
  tokenBalance: number;
  expiryDate?: Date;
  brandId: number;
  type: OwnerType;
  createdAt?: Date;
  updatedAt?: Date;
}

@Table({
  tableName: "tokens",
  timestamps: true,
})
export class TokenModel extends Model<TokenModel, TokenDetails> {
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

  @Index({ name: "idx_token_brand_id" })
  @ForeignKey(() => BrandModel)
  @Column({
    type: DataType.BIGINT,
    allowNull: false,
  })
  brandId!: number;

  @Index({ name: "idx_token_type" })
  @Column({
    type: DataType.ENUM(...Object.values(OwnerType)),
    allowNull: false,
  })
  type!: OwnerType;

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
