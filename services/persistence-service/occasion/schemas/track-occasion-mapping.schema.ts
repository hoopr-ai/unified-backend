import {
  Table,
  Column,
  Model,
  DataType,
  PrimaryKey,
  Unique,
  BelongsTo,
} from "sequelize-typescript";
import { OccasionModel } from "./occasion.schema";
import { TrackModel } from "../../track/schemas/track.schema";

export interface TrackOccasionMappingDetails {
  id: string;
  occasionId?: number;
  trackId?: string;
  rank?: number;
}

// CMS-managed occasion↔track association — direct link, independent of the
// legacy keyword-tagging system (occasions -> keywords -> track_keyword_mappings)
// that GET /occasions/:id/tracks also reads from. Mirrors track_playlist_mappings.
@Table({
  tableName: "track_occasion_mappings",
  timestamps: false,
})
export class TrackOccasionMappingModel extends Model<
  TrackOccasionMappingModel,
  TrackOccasionMappingDetails
> {
  @PrimaryKey
  @Column({
    type: DataType.UUID,
    defaultValue: DataType.UUIDV4,
  })
  id!: string;

  @Unique("track_occasion_mappings_occasionId_trackId_key")
  @Column({ type: DataType.BIGINT, allowNull: true })
  occasionId?: number;

  @Unique("track_occasion_mappings_occasionId_trackId_key")
  @Column({ type: DataType.UUID, allowNull: true })
  trackId?: string;

  @Column({ type: DataType.INTEGER, allowNull: true })
  rank?: number;

  @BelongsTo(() => OccasionModel, { foreignKey: "occasionId", constraints: false })
  occasion?: OccasionModel;

  @BelongsTo(() => TrackModel, { foreignKey: "trackId", constraints: false })
  track?: TrackModel;
}
