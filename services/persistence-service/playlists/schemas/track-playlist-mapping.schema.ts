import {
  Table,
  Column,
  Model,
  DataType,
  PrimaryKey,
  Unique,
  BelongsTo,
} from "sequelize-typescript";
import { PlaylistModel } from "./playlist.schema";
import { TrackModel } from "../../track/schemas/track.schema";

export interface TrackPlaylistMappingDetails {
  id: string;
  playlistId?: string;
  trackId?: string;
  rank?: number;
}

@Table({
  tableName: "track_playlist_mappings",
  timestamps: false,
})
export class TrackPlaylistMappingModel extends Model<
  TrackPlaylistMappingModel,
  TrackPlaylistMappingDetails
> {
  @PrimaryKey
  @Column({
    type: DataType.UUID,
    defaultValue: DataType.UUIDV4,
  })
  id!: string;

  @Unique("track_playlist_mappings_playlistId_trackId_key")
  @Column({
    type: DataType.UUID,
    allowNull: true,
  })
  playlistId?: string;

  @Unique("track_playlist_mappings_playlistId_trackId_key")
  @Column({
    type: DataType.UUID,
    allowNull: true,
  })
  trackId?: string;

  @Column({
    type: DataType.INTEGER,
    allowNull: true,
  })
  rank?: number;

  @BelongsTo(() => PlaylistModel, { foreignKey: "playlistId", constraints: false })
  playlist?: PlaylistModel;

  @BelongsTo(() => TrackModel, { foreignKey: "trackId", constraints: false })
  track?: TrackModel;
}
