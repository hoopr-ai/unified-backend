import {
  Table,
  Column,
  Model,
  DataType,
  PrimaryKey,
  AutoIncrement,
  CreatedAt,
  UpdatedAt,
} from "sequelize-typescript";

export interface OccasionDetails {
  id?: number;
  title: string;
  month: string;
  date: string;
  className: string;
  end: string;
  occasionCode?: string;
  imageLink?: string;
  description?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}

@Table({ tableName: "occasions", timestamps: true })
export class OccasionModel extends Model<OccasionModel, OccasionDetails> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.BIGINT)
  id!: number;

  @Column({ type: DataType.STRING(255), allowNull: false })
  title!: string;

  @Column({ type: DataType.STRING(20), allowNull: false })
  month!: string;

  @Column({ type: DataType.STRING(5), allowNull: false })
  date!: string;

  @Column({ type: DataType.STRING(100), allowNull: false })
  className!: string;

  @Column({ type: DataType.STRING(20), allowNull: false })
  end!: string;

  // Public/business code — used as the rail item's itemCode. Mirrors
  // playlists.playlistCode.
  @Column({ type: DataType.STRING(255), allowNull: true, unique: true })
  occasionCode?: string;

  // Uploaded cover image URL. Mirrors playlists.imageLink.
  @Column({ type: DataType.STRING(1024), allowNull: true })
  imageLink?: string;

  // Editorial blurb shown under the occasion's hero on the storefront. TEXT
  // rather than a capped STRING because it is prose the music team writes, and
  // nothing downstream truncates it. See
  // scripts/migration-add-occasion-description.sql.
  @Column({ type: DataType.TEXT, allowNull: true })
  description?: string | null;

  @CreatedAt
  @Column({ type: DataType.DATE })
  createdAt!: Date;

  @UpdatedAt
  @Column({ type: DataType.DATE, allowNull: true })
  updatedAt?: Date;
}
