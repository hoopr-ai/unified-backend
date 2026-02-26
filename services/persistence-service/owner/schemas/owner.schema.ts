import {
  Table,
  Column,
  Model,
  DataType,
  PrimaryKey,
  CreatedAt,
  UpdatedAt,
  Unique,
  Index,
  Default,
} from "sequelize-typescript";

// OwnerType is now a free-form string (no enum restriction)

export enum OwnerStatus {
  Active = "Active",
  Inactive = "Inactive",
  Suspended = "Suspended",
}

export interface OwnerDetails {
  id?: string;
  ownerCode: string;
  username?: string;
  type?: string; // Changed from OwnerType to string for flexibility
  subType?: string;
  category?: string;
  status?: OwnerStatus;
  revenueGenerated?: number;
  revenueShare?: number;
  licenseStart?: Date;
  licenseEnd?: Date;
  isActive?: boolean;
  IPRS?: number;
  remarks?: string;
  metadata?: object;
  usageInfo?: object;
  restrictedCategories?: object;
  deleted?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

@Table({
  tableName: "owners",
  timestamps: true,
})
export class OwnerModel extends Model<OwnerModel, OwnerDetails> {
  @PrimaryKey
  @Column({
    type: DataType.UUID,
    defaultValue: DataType.UUIDV4,
  })
  id!: string;

  @Unique
  @Index
  @Column({
    type: DataType.STRING(255),
    allowNull: false,
  })
  ownerCode!: string;

  @Index
  @Column({
    type: DataType.STRING(255),
    allowNull: true,
  })
  username!: string;

  @Column({
    type: DataType.STRING(100), // Changed from ENUM to STRING for flexibility
    allowNull: true,
  })
  type?: string;

  @Column({
    type: DataType.STRING(100),
    allowNull: true,
  })
  subType?: string;

  @Column({
    type: DataType.STRING(255),
    allowNull: true,
  })
  category?: string;

  @Default(OwnerStatus.Active)
  @Column({
    type: DataType.ENUM(...Object.values(OwnerStatus)),
    allowNull: true,
  })
  status?: OwnerStatus;

  @Default(0)
  @Column({
    type: DataType.INTEGER,
    allowNull: true,
  })
  revenueGenerated?: number;

  @Column({
    type: DataType.FLOAT,
    allowNull: true,
  })
  revenueShare?: number;

  @Column({
    type: DataType.DATE,
    allowNull: true,
  })
  licenseStart?: Date;

  @Column({
    type: DataType.DATE,
    allowNull: true,
  })
  licenseEnd?: Date;

  @Default(true)
  @Column({
    type: DataType.BOOLEAN,
    allowNull: true,
  })
  isActive?: boolean;

  @Default(0)
  @Column({
    type: DataType.INTEGER,
    allowNull: true,
  })
  IPRS?: number;

  @Column({
    type: DataType.TEXT,
    allowNull: true,
  })
  remarks?: string;

  @Column({
    type: DataType.JSONB,
    allowNull: true,
  })
  metadata?: object;

  @Column({
    type: DataType.JSONB,
    allowNull: true,
  })
  usageInfo?: object;

  @Column({
    type: DataType.JSONB,
    allowNull: true,
  })
  restrictedCategories?: object;

  @Index({ name: "idx_owner_deleted" })
  @Column({
    type: DataType.DATE,
    allowNull: true,
  })
  deleted?: Date;

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

  get isLicenseValid(): boolean {
    if (!this.licenseStart || !this.licenseEnd) return false;
    const now = new Date();
    return now >= this.licenseStart && now <= this.licenseEnd;
  }
}
