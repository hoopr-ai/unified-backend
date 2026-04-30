import {
  Table, Column, Model, DataType, PrimaryKey, AutoIncrement,
  CreatedAt, UpdatedAt, Index,
} from "sequelize-typescript";

export interface ContactUsAttributes {
  id?: number;
  platform: string;
  name: string;
  email: string;
  mobile?: string | null;
  brandName?: string | null;
  message?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}

@Table({ tableName: "contact_us", timestamps: true })
export class ContactUsModel extends Model<ContactUsModel, ContactUsAttributes> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.BIGINT)
  id!: number;

  @Index({ name: "idx_contact_us_platform" })
  @Column({ type: DataType.STRING(50), allowNull: false })
  platform!: string;

  @Column({ type: DataType.STRING(255), allowNull: false })
  name!: string;

  @Index({ name: "idx_contact_us_email" })
  @Column({ type: DataType.STRING(255), allowNull: false })
  email!: string;

  @Column({ type: DataType.STRING(50), allowNull: true })
  mobile?: string | null;

  @Column({ type: DataType.STRING(255), allowNull: true })
  brandName?: string | null;

  @Column({ type: DataType.TEXT, allowNull: true })
  message?: string | null;

  @CreatedAt
  @Column({ type: DataType.DATE })
  createdAt!: Date;

  @UpdatedAt
  @Column({ type: DataType.DATE })
  updatedAt!: Date;
}
