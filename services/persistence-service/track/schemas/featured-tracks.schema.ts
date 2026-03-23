import {
  Table,
  Column,
  Model,
  DataType,
  PrimaryKey,
  AutoIncrement,
  CreatedAt,
  UpdatedAt,
  Index,
} from "sequelize-typescript";

export interface FeaturedTracksDetails {
  id?: number;
  platform: string;
  trackCodes: string[];
  createdAt?: Date;
  updatedAt?: Date;
}

@Table({
  tableName: "featured_tracks",
  timestamps: true,
})
export class FeaturedTracksModel extends Model<FeaturedTracksModel, FeaturedTracksDetails> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.BIGINT)
  id!: number;

  @Index({ unique: true })
  @Column({
    type: DataType.STRING(255),
    allowNull: false,
  })
  platform!: string;

  @Column({
    type: DataType.ARRAY(DataType.STRING),
    allowNull: false,
    defaultValue: [],
  })
  trackCodes!: string[];

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
}
