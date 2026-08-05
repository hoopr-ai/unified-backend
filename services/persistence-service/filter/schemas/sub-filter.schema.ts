import {
  Table,
  Column,
  Model,
  DataType,
  PrimaryKey,
  BelongsTo,
  HasMany,
} from "sequelize-typescript";
import { FilterModel } from "./filter.schema";
import { TrackSubFilterMappingModel } from "./track-subfilter-mapping.schema";

export interface SubFilterDetails {
  id: string;
  name?: string | null;
  filterId?: string | null;
  type?: string | null;
  description?: string | null;
  imageUrl?: string | null;
  name_slug?: string | null;
}

@Table({
  tableName: "subFilters",
  timestamps: false,
})
export class SubFilterModel extends Model<SubFilterModel, SubFilterDetails> {
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
  name?: string | null;

  // Parent filter — an sfxcategory row in `filters` for subsfxcategory sub-filters.
  @Column({
    type: DataType.UUID,
    allowNull: true,
  })
  filterId?: string | null;

  // Source column is a pg enum ('subgenre' | 'subsfxcategory'); kept as text here
  // to match how `filters.type` is stored in this DB.
  @Column({
    type: DataType.STRING(255),
    allowNull: true,
  })
  type?: string | null;

  @Column({
    type: DataType.TEXT,
    allowNull: true,
  })
  description?: string | null;

  @Column({
    type: DataType.TEXT,
    allowNull: true,
  })
  imageUrl?: string | null;

  // Not unique — the source allows the same slug under different parent filters.
  @Column({
    type: DataType.TEXT,
    allowNull: true,
  })
  name_slug?: string | null;

  @BelongsTo(() => FilterModel, { foreignKey: "filterId", constraints: false })
  filter?: FilterModel;

  @HasMany(() => TrackSubFilterMappingModel, {
    foreignKey: "subFilterId",
    as: "trackMappings",
    constraints: false,
  })
  trackMappings?: TrackSubFilterMappingModel[];
}
