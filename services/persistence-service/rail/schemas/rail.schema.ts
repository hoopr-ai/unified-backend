import {
  Table,
  Column,
  Model,
  DataType,
  PrimaryKey,
  AutoIncrement,
  CreatedAt,
  UpdatedAt,
  Default,
  Index,
  HasMany,
  ForeignKey,
} from "sequelize-typescript";
import { RailType, RailSourceType, PageName } from "../../../dto-service/modules.export";
import { RailItemModel } from "./rail-item.schema";
import { UserModel } from "../../user/schemas/user.schema";

export interface RailSeeMoreDescriptor {
  service: string;
  endpoint: string;
  params?: Record<string, unknown>;
}

export interface RailSourceConfig {
  preview?: RailSeeMoreDescriptor;
  seeMore?: RailSeeMoreDescriptor;
  [key: string]: unknown;
}

/**
 * Widget content for the app-home pages (the `config` column — NOT
 * `sourceConfig`). Shape varies by `subType`: BANNERS/CATEGORY_GRID carry an
 * `items` array, the copy widgets carry headline/CTA fields. Deliberately open:
 * Content-Recommendation owns the per-subType schema, and this service stores
 * and echoes it verbatim so a new widget type needs no change here.
 */
export interface RailWidgetConfig {
  items?: unknown[];
  [key: string]: unknown;
}

export interface RailDetails {
  id?: number;
  key: string;
  title: string;
  subtitle?: string | null;
  type: RailType;
  subType?: string | null;
  brandId?: number | null;
  pageName?: PageName;
  sourceType: RailSourceType;
  // "MANUAL" (app serves only curated rail_items) or "AUTO" (app auto-fills
  // from the catalogue; rail_items become PIN/HIDE overrides). Read by the
  // Content-Recommendation app endpoint; surfaced here so the CMS can toggle it.
  populateMode?: string | null;
  sourceConfig?: RailSourceConfig | null;
  // Widget content for app-home rails. See the column comment below.
  config?: RailWidgetConfig | null;
  order: number;
  isVisible: boolean;
  updatedById?: number | null;
  createdAt?: Date;
  updatedAt?: Date;
}

@Table({
  tableName: "rails",
  timestamps: true,
  indexes: [
    { name: "rails_key_brand_page_unique", unique: true, fields: ["key", "brandId", "pageName"] },
    { name: "rails_brand_page_visible_order_idx", fields: ["brandId", "pageName", "isVisible", "order"] },
  ],
})
export class RailModel extends Model<RailModel, RailDetails> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.BIGINT)
  id!: number;

  @Index
  @Column({
    type: DataType.STRING(100),
    allowNull: false,
  })
  key!: string;

  @Column({
    type: DataType.STRING(255),
    allowNull: false,
  })
  title!: string;

  @Column({
    type: DataType.STRING(255),
    allowNull: true,
  })
  subtitle?: string | null;

  @Column({
    type: DataType.STRING(50),
    allowNull: false,
  })
  type!: RailType;

  @Column({
    type: DataType.STRING(100),
    allowNull: true,
  })
  subType?: string | null;

  @Column({
    type: DataType.BIGINT,
    allowNull: true,
  })
  brandId?: number | null;

  @Default("HOME")
  @Column({
    type: DataType.STRING(50),
    allowNull: false,
  })
  pageName!: PageName;

  @Default(RailSourceType.MANUAL)
  @Column({
    type: DataType.STRING(50),
    allowNull: false,
  })
  sourceType!: RailSourceType;

  // App rail population mode: "MANUAL" | "AUTO" (column already exists in the
  // shared DB; mapped here so the CMS can read/toggle it). Nullable — legacy
  // rails treat NULL as MANUAL.
  @Column({
    type: DataType.STRING(50),
    allowNull: true,
  })
  populateMode?: string | null;

  @Column({
    type: DataType.JSONB,
    allowNull: true,
  })
  sourceConfig?: RailSourceConfig | null;

  // Widget content for the app-home pages: banner slides, category tiles,
  // taglines, headline/CTA copy. Written by Content-Recommendation's app-home
  // seeds and read by GET /smash/app/home, which renders WIDGET/BANNERS rails
  // straight from here instead of from rail_items. Distinct from
  // `sourceConfig` above, which holds this service's own query/aiQuery source
  // configuration — do not conflate them. Mapped so the CMS can show and edit
  // widget rails, whose bodies are otherwise invisible to it.
  @Column({
    type: DataType.JSONB,
    allowNull: true,
  })
  config?: RailWidgetConfig | null;

  @Default(0)
  @Column({
    type: DataType.INTEGER,
    allowNull: false,
  })
  order!: number;

  @Default(true)
  @Column({
    type: DataType.BOOLEAN,
    allowNull: false,
  })
  isVisible!: boolean;

  @Index({ name: "idx_rails_updated_by_id" })
  @ForeignKey(() => UserModel)
  @Column({
    type: DataType.INTEGER,
    allowNull: true,
  })
  updatedById?: number | null;

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

  @HasMany(() => RailItemModel, { foreignKey: "railId", as: "items", constraints: false })
  items?: RailItemModel[];
}
