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
