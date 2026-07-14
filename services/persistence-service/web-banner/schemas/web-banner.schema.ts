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

export interface WebBannerDetails {
  id?: number;
  bannerCode?: string;
  title: string;
  imageLink?: string;
  mobileImageLink?: string;
  linkPath?: string;
  linkParams?: Record<string, string> | null;
  isActive?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

// Landscape (4:1) carousel banners for the enterprise storefront.
//
// Deliberately NOT the same entity as the existing "Home Banners" CMS
// (/smash/banners, served by the Flask app) — those are 5:7 portrait app tiles
// with a TRACK/PLAYLIST/ARTIST target and an assortment. Different surface,
// different aspect, different backend.
//
// There is no `placement`/`page` column: a banner's page is decided by which
// BANNERS rail it is added to, and rails already carry pageName.
@Table({ tableName: "web_banners", timestamps: true })
export class WebBannerModel extends Model<WebBannerModel, WebBannerDetails> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.BIGINT)
  id!: number;

  // Public/business code — used as the rail item's itemCode.
  @Column({ type: DataType.STRING(255), allowNull: true, unique: true })
  bannerCode?: string;

  // Admin-facing name; also the image's alt text on the storefront.
  @Column({ type: DataType.STRING(255), allowNull: false })
  title!: string;

  @Column({ type: DataType.STRING(1024), allowNull: true })
  imageLink?: string;

  // Optional narrower crop. Falls back to imageLink when unset — today the
  // desktop and mobile carousels use identical art.
  @Column({ type: DataType.STRING(1024), allowNull: true })
  mobileImageLink?: string;

  // Where the banner navigates. Either a storefront route already resolved to a
  // concrete path ("/playlists/travel", "/tracks/20828") or an absolute URL
  // ("https://smash.hoopr.ai/..."); the client treats anything matching
  // ^https?:// as external. Null means the banner is not clickable.
  @Column({ type: DataType.STRING(1024), allowNull: true })
  linkPath?: string;

  // Query params for linkPath, e.g. { pageName, railId, railType } for a
  // rail see-all link.
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
