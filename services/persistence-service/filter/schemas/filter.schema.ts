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
import { FilterStatus } from "../../../dto-service/modules.export";

export interface FilterDetails {
  id: string;
  name: string;
  status: FilterStatus;
  type?: string;
  createdAt: Date;
  updatedAt?: Date;
}

@Table({
  tableName: "filters",
  timestamps: true,
})
export class FilterModel extends Model<FilterModel, FilterDetails> {
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
  name!: string;

  @Default(FilterStatus.ACTIVE)
  @Column({
    type: DataType.STRING(50),
    allowNull: false,
  })
  status!: FilterStatus;
  
  @Column({
    type: DataType.STRING(255),
    allowNull: true,
  })
  type?: string;

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
