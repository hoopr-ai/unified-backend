import {
  Table,
  Column,
  Model,
  DataType,
  PrimaryKey,
  CreatedAt,
  UpdatedAt,
  Default,
  HasMany,
} from "sequelize-typescript";
import { FilterStatus } from "../../../dto-service/modules.export";
import { TrackFilterMappingModel } from "./track-filter-mapping.schema";

export interface FilterDetails {
  id: string;
  name: string;
  name_slug?: string | null;
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

  @Column({
    type: DataType.STRING(255),
    allowNull: true,
  })
  name_slug?: string | null;

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

  @HasMany(() => TrackFilterMappingModel, { foreignKey: "filterId", as: "trackMappings", constraints: false })
  trackMappings?: TrackFilterMappingModel[];
}
