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
  Default,
} from "sequelize-typescript";
import { OrganizationModel } from "../../organization/schemas/modules.export";
import type { BrandStatus } from "../../../dto-service/modules.export";

export interface BrandDetails {
  id?: number;
  organizationId: number;
  name: string;
  description?: string;
  status: BrandStatus;
  createdBy?: number;
  restrictedOwners?: string[];
  restrictedTrackTiers?: string[];
  createdAt: Date;
  updatedAt?: Date;
}

@Table({
  tableName: "brands",
  timestamps: true,
})
export class BrandModel extends Model<BrandModel, BrandDetails> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.BIGINT)
  id!: number;

  @ForeignKey(() => OrganizationModel)
  @Column({
    type: DataType.BIGINT,
    allowNull: false,
  })
  organizationId!: number;

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
  status!: BrandStatus;

  @Column({
    type: DataType.BIGINT,
    allowNull: true,
  })
  createdBy?: number;

  @Default([])
  @Column({
    type: DataType.ARRAY(DataType.STRING),
    allowNull: true,
  })
  restrictedOwners?: string[];

  @Default([])
  @Column({
    type: DataType.ARRAY(DataType.TEXT),
    allowNull: true,
  })
  restrictedTrackTiers?: string[];

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

  @BelongsTo(() => OrganizationModel)
  organization!: OrganizationModel;
}
