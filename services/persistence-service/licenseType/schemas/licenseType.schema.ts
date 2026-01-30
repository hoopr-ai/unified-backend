import {
  Table,
  Column,
  Model,
  DataType,
  PrimaryKey,
  CreatedAt,
  UpdatedAt,
  HasMany,
} from "sequelize-typescript";

export enum LicenseTypeEnum {
  STANDARD = "standard",
  PREMIUM = "premium",
  ENTERPRISE = "enterprise",
}

export interface LicenseTypeDetails {
  id: string;
  name?: string;
  type?: LicenseTypeEnum;
  template?: string;
  price?: number;
  discontinued?: boolean;
  deleted?: Date;
  createdAt: Date;
  updatedAt: Date;
  template_buisness?: string;
}

@Table({
  tableName: "licenseTypes",
  timestamps: true,
})
export class LicenseTypeModel extends Model<LicenseTypeModel, LicenseTypeDetails> {
  @PrimaryKey
  @Column({
    type: DataType.UUID,
    defaultValue: DataType.UUIDV4,
  })
  id!: string;

  @Column({
    type: DataType.STRING(255),
    allowNull: true,
  })
  name?: string;

  @Column({
    type: DataType.STRING(255),
    allowNull: true,
  })
  type?: string;

  @Column({
    type: DataType.TEXT,
    allowNull: true,
  })
  template?: string;

  @Column({
    type: DataType.INTEGER,
    allowNull: true,
  })
  price?: number;

  @Column({
    type: DataType.BOOLEAN,
    allowNull: true,
  })
  discontinued?: boolean;

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
    type: DataType.TEXT,
    allowNull: true,
  })
  template_buisness?: string;
}
