import {
  Table,
  Column,
  Model,
  DataType,
  PrimaryKey,
  Index,
  BelongsTo,
} from "sequelize-typescript";
import { SubFilterModel } from "./sub-filter.schema";
import { TrackModel } from "../../track/schemas/track.schema";

export interface TrackSubFilterMappingDetails {
  id: string;
  subFilterId?: string;
  trackId?: string;
}

@Table({
  tableName: "track_subfilter_mappings",
  timestamps: false,
})
export class TrackSubFilterMappingModel extends Model<
  TrackSubFilterMappingModel,
  TrackSubFilterMappingDetails
> {
  @PrimaryKey
  @Column({
    type: DataType.UUID,
    defaultValue: DataType.UUIDV4,
  })
  id!: string;

  @Index({
    name: "track_subfilter_mappings_subFilterId_trackId_key",
    unique: true,
  })
  @Column({
    type: DataType.UUID,
    allowNull: true,
  })
  subFilterId?: string;

  @Index({
    name: "track_subfilter_mappings_subFilterId_trackId_key",
    unique: true,
  })
  @Column({
    type: DataType.UUID,
    allowNull: true,
  })
  trackId?: string;

  @BelongsTo(() => SubFilterModel, {
    foreignKey: "subFilterId",
    constraints: false,
  })
  subFilter?: SubFilterModel;

  @BelongsTo(() => TrackModel, { foreignKey: "trackId", constraints: false })
  track?: TrackModel;
}
