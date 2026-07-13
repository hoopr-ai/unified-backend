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

export interface QuickAddDetails {
  id?: number;
  quickAddCode?: string;
  label: string;
  imageLink?: string;
  linkPath?: string;
  linkParams?: Record<string, string> | null;
  isActive?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

@Table({ tableName: "quick_adds", timestamps: true })
export class QuickAddModel extends Model<QuickAddModel, QuickAddDetails> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.BIGINT)
  id!: number;

  // Public/business code — used as the rail item's itemCode. Mirrors
  // occasions.occasionCode / playlists.playlistCode.
  @Column({ type: DataType.STRING(255), allowNull: true, unique: true })
  quickAddCode?: string;

  // Tile caption shown next to the artwork on the storefront.
  @Column({ type: DataType.STRING(255), allowNull: false })
  label!: string;

  // Uploaded tile artwork URL (the pre-composed fanned-stack collage).
  @Column({ type: DataType.STRING(1024), allowNull: true })
  imageLink?: string;

  // Client-side route the tile navigates to, e.g. "/genres" or
  // "/rails/vocal-exclusive". Stored without a query string — see linkParams.
  @Column({ type: DataType.STRING(512), allowNull: true })
  linkPath?: string;

  // Query params for linkPath, e.g. { pageName: "HOOPR_ORIGINALS", railId: "156" }.
  // Kept separate from linkPath because the storefront router takes `to` and
  // `search` as distinct props, and railIds differ per environment.
  @Column({ type: DataType.JSONB, allowNull: true })
  linkParams?: Record<string, string> | null;

  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: true })
  isActive!: boolean;

  @CreatedAt
  @Column({ type: DataType.DATE })
  createdAt!: Date;

  @UpdatedAt
  @Column({ type: DataType.DATE, allowNull: true })
  updatedAt?: Date;
}
