import {
  Table,
  Column,
  Model,
  DataType,
  PrimaryKey,
  Default,
  Index,
  BelongsTo,
} from "sequelize-typescript";
import { PlaylistModel } from "../src/models/playlist.schema";

/**
 * Access-control join: which playlists a B2B enterprise is allowed to read.
 * A client that is NOT `unrestrictedCatalog` may only see tracks belonging to
 * playlists mapped here.
 */
export interface EnterprisePlaylistMappingDetails {
  id: string;
  enterpriseId: string;
  playlistId: string;
}

@Table({
  tableName: "enterprise_playlist_mappings",
  timestamps: false,
})
export class EnterprisePlaylistMappingModel extends Model<
  EnterprisePlaylistMappingModel,
  EnterprisePlaylistMappingDetails
> {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column({ type: DataType.UUID })
  id!: string;

  @Index({
    name: "enterprise_playlist_mappings_enterpriseId_playlistId_key",
    unique: true,
  })
  @Column({ type: DataType.UUID, allowNull: false })
  enterpriseId!: string;

  @Index({
    name: "enterprise_playlist_mappings_enterpriseId_playlistId_key",
    unique: true,
  })
  @Column({ type: DataType.UUID, allowNull: false })
  playlistId!: string;

  @BelongsTo(() => PlaylistModel, { foreignKey: "playlistId", constraints: false })
  playlist?: PlaylistModel;
}
