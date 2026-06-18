import {
  Table,
  Column,
  Model,
  DataType,
  PrimaryKey,
  CreatedAt,
  UpdatedAt,
  Index,
  HasMany,
  BelongsTo,
  ForeignKey,
} from "sequelize-typescript";
import { TrackArtistMappingModel } from "../../artists/schemas/track-artist-mapping.schema";
import { SkuModel } from "../../sku/schemas/sku.schema";
import { TrackFilterMappingModel } from "../../filter/schemas/track-filter-mapping.schema";
import { CampaignModel } from "../../campaign/schemas/campaign.schema";

export enum TrackType {
  // Add your enum values based on public."enum_tracks_type"
}

export interface TrackDetails {
  id: string;
  trackCode: string;
  type?: string;
  name?: string;
  description?: string;
  duration?: number;
  size?: number;
  bpm?: string;
  songKey?: string[];
  timeSignature?: string;
  region?: string;
  releaseRegion?: string;
  releaseDate?: Date;
  ownerId?: string[];
  hasVocals?: boolean;
  isPRO?: boolean;
  displayTags?: string[];
  sourceLink?: string;
  waveformLink?: string;
  name_slug?: string;
  mp3Link?: string;
  ISRC?: string;
  lyrics?: string;
  tier?: string;
  energy?: string;
  industry?: object;
  status?: string;
  createdAt: Date;
  updatedAt: Date;
  publisherId?: string[];
  pastIds?: string[];
  trending?: boolean;
  reelCount?: string;
  partnerId?: string;
  bollywood?: string;
  jioSaavanStream?: string;
  campaignId?: number;
  artLink?: string;
  hookTimings?: unknown;
  artworkLink?: string;
  notVisibleToB2b?: boolean | null;
}

@Table({
  tableName: "tracks",
  timestamps: true,
})
export class TrackModel extends Model<TrackModel> {
  @PrimaryKey
  @Column({
    type: DataType.UUID,
    defaultValue: DataType.UUIDV4,
  })
  id!: string;

  @Index({ unique: true })
  @Column({
    type: DataType.STRING(255),
    allowNull: false,
  })
  trackCode!: string;

  @Column({
    type: DataType.STRING(255),
    allowNull: true,
  })
  type?: string;

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
    type: DataType.INTEGER,
    allowNull: true,
  })
  duration?: number;

  @Column({
    type: DataType.INTEGER,
    allowNull: true,
  })
  size?: number;

  @Column({
    type: DataType.STRING(255),
    allowNull: true,
  })
  bpm?: string;

  @Column({
    type: DataType.ARRAY(DataType.STRING),
    allowNull: true,
  })
  songKey?: string[];

  @Column({
    type: DataType.STRING(255),
    allowNull: true,
  })
  timeSignature?: string;

  @Column({
    type: DataType.STRING(255),
    allowNull: true,
  })
  region?: string;

  @Column({
    type: DataType.STRING(255),
    allowNull: true,
  })
  releaseRegion?: string;

  @Column({
    type: DataType.DATE,
    allowNull: true,
  })
  releaseDate?: Date;

  @Column({
    type: DataType.ARRAY(DataType.UUID),
    allowNull: true,
  })
  ownerId?: string[];

  @Column({
    type: DataType.BOOLEAN,
    allowNull: true,
  })
  hasVocals?: boolean;

  @Column({
    type: DataType.BOOLEAN,
    allowNull: true,
  })
  isPRO?: boolean;

  @Column({
    type: DataType.ARRAY(DataType.STRING),
    allowNull: true,
  })
  displayTags?: string[];

  @Column({
    type: DataType.STRING(255),
    allowNull: true,
  })
  sourceLink?: string;

  @Column({
    type: DataType.STRING(255),
    allowNull: true,
  })
  name_slug?: string;

  @Column({
    type: DataType.TEXT,
    allowNull: true,
  })
  waveformLink?: string;

  @Column({
    type: DataType.TEXT,
    allowNull: true,
  })
  mp3Link?: string;

  @Column({
    type: DataType.STRING(255),
    allowNull: true,
  })
  ISRC?: string;

  @Column({
    type: DataType.TEXT,
    allowNull: true,
  })
  lyrics?: string;

  @Column({
    type: DataType.STRING(255),
    allowNull: true,
  })
  tier?: string;

  @Column({
    type: DataType.STRING(255),
    allowNull: true,
  })
  energy?: string;

  @Column({
    type: DataType.JSONB,
    allowNull: true,
  })
  industry?: object;

  @Column({
    type: DataType.STRING(50),
    allowNull: true,
  })
  status?: string;

  @CreatedAt
  @Column({
    type: DataType.DATE,
  })
  createdAt!: Date;

  @UpdatedAt
  @Column({
    type: DataType.DATE,
  })
  updatedAt!: Date;

  @Column({
    type: DataType.ARRAY(DataType.UUID),
    allowNull: true,
  })
  publisherId?: string[];

  @Column({
    type: DataType.ARRAY(DataType.STRING),
    allowNull: true,
  })
  pastIds?: string[];

  @Column({
    type: DataType.BOOLEAN,
    allowNull: true,
  })
  trending?: boolean;

  @Column({
    type: DataType.STRING(2),
    allowNull: true,
  })
  premium?: string;

  @Column({
    type: DataType.STRING(255),
    allowNull: true,
  })
  reelCount?: string;

  @Column({
    type: DataType.UUID,
    allowNull: true,
  })
  partnerId?: string;

  @Column({
    type: DataType.STRING,
    allowNull: true,
  })
  bollywood?: string;

  @Column({
    type: DataType.STRING,
    allowNull: true,
  })
  jioSaavanStream?: string;

  @Column({
    type: DataType.STRING(255),
    allowNull: true,
  })
  artLink?: string;

  @ForeignKey(() => CampaignModel)
  @Column({
    type: DataType.BIGINT,
    allowNull: true,
  })
  campaignId?: number;

  @Column({
    type: DataType.JSONB,
    allowNull: true,
  })
  hookTimings?: unknown;

  @Column({
    type: DataType.TEXT,
    allowNull: true,
  })
  artworkLink?: string;

  /**
   * When true, this track is hidden from B2B / enterprise API consumers even
   * if it is otherwise visible on consumer surfaces.
   */
  @Column({
    type: DataType.BOOLEAN,
    allowNull: true,
  })
  notVisibleToB2b?: boolean | null;

  @BelongsTo(() => CampaignModel, "campaignId")
  campaign?: CampaignModel;

  @HasMany(() => TrackArtistMappingModel, "trackId")
  trackArtistMappings?: TrackArtistMappingModel[];

  @HasMany(() => SkuModel, { foreignKey: "trackCode", sourceKey: "trackCode", constraints: false })
  skus?: SkuModel[];

  @HasMany(() => TrackFilterMappingModel, { foreignKey: "trackId", constraints: false })
  trackFilterMappings?: TrackFilterMappingModel[];
}
