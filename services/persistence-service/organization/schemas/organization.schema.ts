import {
  Table,
  Column,
  Model,
  DataType,
  PrimaryKey,
  AutoIncrement,
  CreatedAt,
  UpdatedAt,
} from "sequelize-typescript";
import type { OrganizationStatus } from "../../../dto-service/modules.export";

export interface OrganizationDetails {
  id?: number;
  name: string;
  description?: string;
  status: OrganizationStatus;
  createdBy?: number;
  createdAt: Date;
  updatedAt?: Date;
}

@Table({
  tableName: "organizations",
  timestamps: true,
})
export class OrganizationModel extends Model<OrganizationModel, OrganizationDetails> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.BIGINT)
  id!: number;

  @Column({
    type: DataType.STRING(255),
    allowNull: false,
  })
  name!: string;

  @Column({
    type: DataType.TEXT,
    allowNull: true,
  })
  description?: string;

  @Column({
    type: DataType.STRING(100),
    allowNull: false,
  })
  status!: OrganizationStatus;

  @Column({
    type: DataType.BIGINT,
    allowNull: true,
  })
  createdBy?: number;

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
}
