import {
  Table,
  Column,
  Model,
  DataType,
  PrimaryKey,
  CreatedAt,
  UpdatedAt,
} from "sequelize-typescript";

@Table({
  tableName: "owners",
  timestamps: true,
})
export class OwnerModel extends Model<OwnerModel> {
  @PrimaryKey
  @Column({
    type: DataType.UUID,
    defaultValue: DataType.UUIDV4,
  })
  id!: string;

  @Column({
    type: DataType.STRING(255),
    allowNull: false,
  })
  ownerCode!: string;

  @Column({
    type: DataType.STRING(255),
    allowNull: false,
  })
  username!: string;

  @Column({
    type: DataType.INTEGER,
    allowNull: true,
  })
  revenueGenerated?: number;

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

  @Column({
    type: DataType.BOOLEAN,
    allowNull: true,
  })
  isActive?: boolean;

  @Column({
    type: DataType.FLOAT,
    allowNull: true,
  })
  revenueShare?: number;

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
  })
  updatedAt!: Date;

  @Column({
    type: DataType.INTEGER,
    defaultValue: 0,
    allowNull: true,
  })
  IPRS?: number;

  @Column({
    type: DataType.STRING(255),
    allowNull: true,
  })
  category?: string;

  @Column({
    type: DataType.STRING(255),
    allowNull: true,
  })
  type?: string;
}
