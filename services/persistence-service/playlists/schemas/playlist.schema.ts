import {
  Table,
  Column,
  Model,
  DataType,
  PrimaryKey,
  CreatedAt,
  UpdatedAt,
  Unique,
  HasMany,
} from "sequelize-typescript";
import { PlaylistCategory, PlaylistType } from "../../../dto-service/modules.export";
import { TrackPlaylistMappingModel } from "./track-playlist-mapping.schema";

export interface PlaylistDetails {
  id: string;
  playlistCode?: string;
  name?: string;
  description?: string;
  type?: PlaylistType;
  category?: PlaylistCategory;
  // Legacy column carried over by the native/hoopr migrations. Not read by any
  // app code — kept only so the model still matches the table.
  playlistType?: string;
  name_slug?: string;
  partnerId?: string;
  status?: string;
  imageLink?: string;
  created_by?: string;
  createdAt: Date;
  updatedAt?: Date;
}

@Table({
  tableName: "playlists",
  timestamps: true,
})
export class PlaylistModel extends Model<PlaylistModel, PlaylistDetails> {
  @PrimaryKey
  @Column({
    type: DataType.UUID,
    defaultValue: DataType.UUIDV4,
  })
  id!: string;

  @Unique
  @Column({
    type: DataType.STRING(255),
    allowNull: true,
  })
  playlistCode?: string;

  @Column({
    type: DataType.STRING(255),
    allowNull: true,
  })
  name?: string;

  @Column({
    type: DataType.TEXT,
    allowNull: true,
  })
  description?: string;

  @Column({
    type: DataType.STRING(255),
    allowNull: true,
  })
  type?: PlaylistType;

  // Editorial assortment (HOOPR_ORIGINALS / CHARTBUSTERS / …). Nullable —
  // pre-existing playlists are uncategorised until an admin sets one.
  @Column({
    type: DataType.STRING(255),
    allowNull: true,
  })
  category?: PlaylistCategory;

  @Column({
    type: DataType.STRING(255),
    allowNull: true,
  })
  playlistType?: string;

  @Column({
    type: DataType.STRING(255),
    allowNull: true,
  })
  name_slug?: string;

  @Column({
    type: DataType.UUID,
    allowNull: true,
  })
  partnerId?: string;

  @Column({
    type: DataType.STRING(255),
    allowNull: true,
  })
  status?: string;

  @Column({
    type: DataType.STRING(1024),
    allowNull: true,
  })
  imageLink?: string;

  @Column({
    type: DataType.STRING(255),
    allowNull: true,
  })
  created_by?: string;

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

  @HasMany(() => TrackPlaylistMappingModel, { foreignKey: "playlistId", constraints: false })
  trackPlaylistMappings?: TrackPlaylistMappingModel[];
}
