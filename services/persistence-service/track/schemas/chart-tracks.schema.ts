import {
  Table,
  Column,
  Model,
  DataType,
  PrimaryKey,
  AutoIncrement,
  Index,
} from "sequelize-typescript";

export enum ChartTrackSource {
  POPULAR = "popular",
  TRENDING = "trending",
  JIOSAAVN_STREAMS = "jiosaavn_streams",
}

export interface ChartTrackDetails {
  id?: number;
  trackcode: string;
  source: ChartTrackSource;
  chart_rank?: number;
  first_seen?: Date;
  last_seen?: Date;
  times_charted?: number;
  track_title?: string;
  owner_name?: string;
}

@Table({
  tableName: "chart_tracks",
  timestamps: false,
})
export class ChartTrackModel extends Model<ChartTrackModel, ChartTrackDetails> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  id!: number;

  @Index({ name: "chart_tracks_trackcode_source_key", unique: true })
  @Column({
    type: DataType.STRING,
    allowNull: false,
  })
  trackcode!: string;

  @Index({ name: "chart_tracks_trackcode_source_key", unique: true })
  @Column({
    type: DataType.ENUM(...Object.values(ChartTrackSource)),
    allowNull: false,
  })
  source!: ChartTrackSource;

  @Column({
    type: DataType.INTEGER,
    allowNull: true,
    defaultValue: 0,
  })
  chart_rank?: number;

  @Column({
    type: DataType.DATE,
    allowNull: true,
    defaultValue: DataType.NOW,
  })
  first_seen?: Date;

  @Column({
    type: DataType.DATE,
    allowNull: true,
    defaultValue: DataType.NOW,
  })
  last_seen?: Date;

  @Column({
    type: DataType.INTEGER,
    allowNull: true,
    defaultValue: 1,
  })
  times_charted?: number;

  @Column({
    type: DataType.TEXT,
    allowNull: true,
  })
  track_title?: string;

  @Column({
    type: DataType.TEXT,
    allowNull: true,
  })
  owner_name?: string;
}
