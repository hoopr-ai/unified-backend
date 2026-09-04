import {
  Table,
  Column,
  Model,
  DataType,
  PrimaryKey,
  AutoIncrement,
  CreatedAt,
  UpdatedAt,
  ForeignKey,
  BelongsTo,
  Index,
} from "sequelize-typescript";
import { BrandModel } from "../../brand/schemas/modules.export";

export interface BrandCatalogueRightsDetails {
  id?: number;
  brandId: number;
  catalogue: string;
  rights?: object;
  note?: string | null;
  updatedById?: number | null;
  createdAt?: Date;
  updatedAt?: Date;
}

/**
 * One brand's negotiated deviation from a catalogue's defaults.
 *
 * `rights` holds ONLY the overridden keys — see the merge in
 * catalogue-rights.persistence.service. A full copy would freeze all six flags
 * at write time, so any later change to the catalogue default would silently
 * skip every brand that had ever negotiated a single right.
 */
@Table({
  tableName: "brand_catalogue_rights",
  timestamps: true,
})
export class BrandCatalogueRightsModel extends Model<
  BrandCatalogueRightsModel,
  BrandCatalogueRightsDetails
> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.BIGINT)
  id!: number;

  @Index({ name: "idx_brand_catalogue_rights_brand" })
  @ForeignKey(() => BrandModel)
  @Column({
    type: DataType.BIGINT,
    allowNull: false,
  })
  brandId!: number;

  @Index({ name: "idx_brand_catalogue_rights_catalogue" })
  @Column({
    type: DataType.STRING(255),
    allowNull: false,
  })
  catalogue!: string;

  /** PARTIAL — only the keys this brand negotiated. `{}` means no override. */
  @Column({
    type: DataType.JSONB,
    allowNull: false,
    defaultValue: {},
  })
  rights!: object;

  /** Why this brand differs. An unexplained exception is the one nobody removes. */
  @Column({
    type: DataType.TEXT,
    allowNull: true,
  })
  note?: string | null;

  @Column({
    type: DataType.BIGINT,
    allowNull: true,
  })
  updatedById?: number | null;

  @CreatedAt
  @Column(DataType.DATE)
  createdAt!: Date;

  @UpdatedAt
  @Column(DataType.DATE)
  updatedAt!: Date;

  @BelongsTo(() => BrandModel)
  brand!: BrandModel;
}
