import {
  Table,
  Column,
  Model,
  DataType,
  PrimaryKey,
  CreatedAt,
  UpdatedAt,
  Default,
} from "sequelize-typescript";

export enum CampaignStatus {
  ACTIVE = "ACTIVE",
  INACTIVE = "INACTIVE",
  EXPIRED = "EXPIRED",
}

export enum CampaignPlatform {
  ALL = "ALL",
  ANDROID = "ANDROID",
  IOS = "IOS",
  WEB = "WEB",
}

export enum AmountType {
  PERCENTAGE = "PERCENTAGE",
  FIXED = "FIXED",
}

export interface CampaignDetails {
  id: string;
  status: string;
  validFrom: Date;
  validTill: Date;
  platform: string;
  totalUsage: number;
  currentUsage: number;
  amount: number;
  amountType: string;
  perUserUsage: number;
  createdAt: Date;
  updatedAt: Date;
}

@Table({
  tableName: "campaigns",
  timestamps: true,
})
export class CampaignModel extends Model<CampaignModel, CampaignDetails> {
  @PrimaryKey
  @Column({
    type: DataType.UUID,
    defaultValue: DataType.UUIDV4,
  })
  id!: string;

  @Default(CampaignStatus.ACTIVE)
  @Column({
    type: DataType.STRING(50),
    allowNull: false,
  })
  status!: string;

  @Column({
    type: DataType.DATE,
    allowNull: false,
  })
  validFrom!: Date;

  @Column({
    type: DataType.DATE,
    allowNull: false,
  })
  validTill!: Date;

  @Default(CampaignPlatform.ALL)
  @Column({
    type: DataType.STRING(50),
    allowNull: false,
  })
  platform!: string;

  @Default(0)
  @Column({
    type: DataType.INTEGER,
    allowNull: false,
  })
  totalUsage!: number;

  @Default(0)
  @Column({
    type: DataType.INTEGER,
    allowNull: false,
  })
  currentUsage!: number;

  @Column({
    type: DataType.DOUBLE,
    allowNull: false,
  })
  amount!: number;

  @Default(AmountType.PERCENTAGE)
  @Column({
    type: DataType.STRING(50),
    allowNull: false,
  })
  amountType!: string;

  @Default(1)
  @Column({
    type: DataType.INTEGER,
    allowNull: false,
  })
  perUserUsage!: number;

  @CreatedAt
  @Column({
    type: DataType.DATE,
  })
  createdAt!: Date;

  @UpdatedAt
  @Column({
    type: DataType.DATE,
  })
  updatedAt!: Date;
}
