import {
  Table,
  Column,
  Model,
  DataType,
  PrimaryKey,
  CreatedAt,
  UpdatedAt,
  Unique,
} from "sequelize-typescript";
import type { ArtistType } from "../../../dto-service/modules.export";

export interface ArtistDetails {
  id: string;
  name: string;
  artistCode: string;
  type?: ArtistType[];
  originRegion?: string;
  name_slug?: string;
  instagramLink?: string;
  spotifyLink?: string;
  status?: string;
  pastIds?: string[];
  nativeArtist?: boolean;
  createdAt: Date;
  updatedAt?: Date;
}

@Table({
  tableName: "artists",
  timestamps: true,
})
export class ArtistModel extends Model<ArtistModel, ArtistDetails> {
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

  @Unique
  @Column({
    type: DataType.STRING(255),
    allowNull: false,
  })
  artistCode!: string;

  @Column({
    type: DataType.ARRAY(DataType.STRING),
    allowNull: true,
  })
  type?: ArtistType[];

  @Column({
    type: DataType.STRING(255),
    allowNull: true,
  })
  originRegion?: string;

  @Unique
  @Column({
    type: DataType.STRING(255),
    allowNull: true,
  })
  name_slug?: string;

  @Column({
    type: DataType.STRING(255),
    allowNull: true,
  })
  instagramLink?: string;

  @Column({
    type: DataType.STRING(255),
    allowNull: true,
  })
  spotifyLink?: string;

  @Column({
    type: DataType.STRING(255),
    allowNull: true,
  })
  status?: string;

  @Column({
    type: DataType.ARRAY(DataType.STRING),
    allowNull: true,
  })
  pastIds?: string[];

  /**
   * Does this artist belong to the Creator (native) platform?
   *
   * True when they are the PRIMARY credit on at least one ACTIVE, non-SFX track
   * owned by a 'Hoopr Originals' owner — the exact gate NATIVE-BE's artist
   * directory applies (ArtistsService.ELIGIBLE_CTE). This column is a cached
   * mirror of that query, never a second definition of it: it is derived, and
   * anything that writes it goes through recomputeNativeArtistFlags().
   *
   * Not maintained on the track write path. New Originals tracks land through
   * catalogue imports, so the flag is refreshed by the backfill script or
   * POST /admin/artists/recompute-native (see admin-artist.service).
   */
  @Column({
    type: DataType.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  })
  nativeArtist!: boolean;

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
