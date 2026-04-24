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
} from "sequelize-typescript";
import { RailType, RailSourceType, PageName } from "../../../dto-service/modules.export";
import { RailItemModel } from "./rail-item.schema";

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
  sourceConfig?: RailSourceConfig | null;
  order: number;
  isVisible: boolean;
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

  @Column({
    type: DataType.JSONB,
    allowNull: true,
  })
  sourceConfig?: RailSourceConfig | null;

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
