import {
  Table,
  Column,
  Model,
  DataType,
  PrimaryKey,
  ForeignKey,
  Default,
} from "sequelize-typescript";
import { ArtistModel } from "./artist.schema";
import { TrackModel } from "../../track/schemas/track.schema";
import { ArtistType } from "../../../dto-service/modules.export";

export interface TrackArtistMappingDetails {
  id: string;
  artistId: string;
  trackId: string;
  role: ArtistType;
  isPrimary?: boolean;
}

@Table({
  tableName: "track_artist_mappings",
  timestamps: false,
})
export class TrackArtistMappingModel extends Model<
  TrackArtistMappingModel,
  TrackArtistMappingDetails
> {
  @PrimaryKey
  @Column({
    type: DataType.UUID,
    defaultValue: DataType.UUIDV4,
  })
  id!: string;

  @PrimaryKey
  @ForeignKey(() => ArtistModel)
  @Column({
    type: DataType.UUID,
    allowNull: false,
  })
  artistId!: string;

  @PrimaryKey
  @ForeignKey(() => TrackModel)
  @Column({
    type: DataType.UUID,
    allowNull: false,
  })
  trackId!: string;

  @PrimaryKey
  @Column({
    type: DataType.ENUM(...Object.values(ArtistType)),
    allowNull: false,
  })
  role!: ArtistType;

  @Default(false)
  @Column({
    type: DataType.BOOLEAN,
    allowNull: true,
  })
  isPrimary?: boolean;
}
