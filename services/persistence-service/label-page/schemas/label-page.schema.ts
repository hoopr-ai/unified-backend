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

export interface LabelPageDetails {
  id?: number;
  ownerId: string;
  ownerCode: string;
  slug: string;
  title: string;
  description?: string | null;
  heroImageLink?: string | null;
  mobileHeroImageLink?: string | null;
  logoImageLink?: string | null;
  seoTitle?: string | null;
  seoDescription?: string | null;
  isActive?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

// The storefront page for one record label (owner).
//
// Deliberately holds only the page's own chrome — identity, hero art, copy,
// SEO. The rails ON the page are ordinary `rails` rows whose pageName is
// `LABEL_<ownerCode>` (see labelPageKey in dto-service/rail/rail.enum.ts), so
// the existing Rails CMS composes a label page exactly the way it composes
// HOME. Nothing here duplicates the catalogue: the label itself lives in
// `owners` and is never created from this CMS.
@Table({ tableName: "label_pages", timestamps: true })
export class LabelPageModel extends Model<LabelPageModel, LabelPageDetails> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.BIGINT)
  id!: number;

  // One page per label — a label either has a page or it doesn't.
  @Column({ type: DataType.UUID, allowNull: false, unique: true })
  ownerId!: string;

  // Denormalised from owners.ownerCode: it is what LABELS rail items carry as
  // their itemCode, and what the page key is built from. Kept here so
  // validating a `LABEL_<code>` pageName is one indexed lookup, not a join.
  @Column({ type: DataType.STRING(255), allowNull: false, unique: true })
  ownerCode!: string;

  // Storefront URL segment (/labels/<slug>). Generated from the title on
  // create and editable afterwards.
  @Column({ type: DataType.STRING(255), allowNull: false, unique: true })
  slug!: string;

  // Page heading. Defaults to the owner's username but is editable — the
  // storefront name and the catalogue name are not always the same.
  @Column({ type: DataType.STRING(255), allowNull: false })
  title!: string;

  @Column({ type: DataType.TEXT, allowNull: true })
  description?: string | null;

  @Column({ type: DataType.STRING(1024), allowNull: true })
  heroImageLink?: string | null;

  // Optional narrower crop. Falls back to heroImageLink when unset.
  @Column({ type: DataType.STRING(1024), allowNull: true })
  mobileHeroImageLink?: string | null;

  // The label's mark, shown over the hero. Distinct from the CDN-derived owner
  // artwork the rails tiles use — that one is a square tile, this one is
  // transparent and page-sized.
  @Column({ type: DataType.STRING(1024), allowNull: true })
  logoImageLink?: string | null;

  @Column({ type: DataType.STRING(255), allowNull: true })
  seoTitle?: string | null;

  @Column({ type: DataType.TEXT, allowNull: true })
  seoDescription?: string | null;

  // Unpublishing a page leaves its rails untouched — they simply stop being
  // reachable, so a page can be prepared before it goes live.
  @Index({ name: "label_pages_active_idx" })
  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: true })
  isActive!: boolean;

  @CreatedAt
  @Column({ type: DataType.DATE })
  createdAt!: Date;

  @UpdatedAt
  @Column({ type: DataType.DATE, allowNull: true })
  updatedAt?: Date;
}
