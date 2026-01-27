import {
  Table,
  Column,
  Model,
  DataType,
  PrimaryKey,
  Index,
  BelongsTo,
} from "sequelize-typescript";
import { FilterModel } from "./filter.schema";
import { TrackModel } from "../../track/schemas/track.schema";

export interface TrackFilterMappingDetails {
  id: string;
  filterId?: string;
  trackId?: string;
}

@Table({
  tableName: "track_filter_mappings",
  timestamps: false,
})
export class TrackFilterMappingModel extends Model<
  TrackFilterMappingModel,
  TrackFilterMappingDetails
> {
  @PrimaryKey
  @Column({
    type: DataType.UUID,
    defaultValue: DataType.UUIDV4,
  })
  id!: string;

  @Index({ name: "track_filter_mappings_filterId_trackId_key", unique: true })
  @Column({
    type: DataType.UUID,
    allowNull: true,
  })
  filterId?: string;

  @Index({ name: "track_filter_mappings_filterId_trackId_key", unique: true })
  @Column({
    type: DataType.UUID,
    allowNull: true,
  })
  trackId?: string;

  @BelongsTo(() => FilterModel, { foreignKey: "filterId", constraints: false })
  filter?: FilterModel;

  @BelongsTo(() => TrackModel, { foreignKey: "trackId", constraints: false })
  track?: TrackModel;
}
