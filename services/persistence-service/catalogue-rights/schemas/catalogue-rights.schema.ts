import {
  Table,
  Column,
  Model,
  DataType,
  PrimaryKey,
  CreatedAt,
  UpdatedAt,
} from "sequelize-typescript";

export interface CatalogueRightsDetails {
  catalogue: string;
  rights?: object;
  updatedById?: number | null;
  createdAt?: Date;
  updatedAt?: Date;
}

/**
 * Default rights for one catalogue.
 *
 * The PRIMARY KEY is the catalogue NAME, not a surrogate id — a catalogue is
 * not an entity anywhere in this schema, it is the free-text string carried by
 * owners.type and token_assigned.type (identical four values on both, verified
 * against prod). Keying by the name is what lets this table join to the two
 * columns that already exist instead of requiring both to be rewritten.
 */
@Table({
  tableName: "catalogue_rights",
  timestamps: true,
})
export class CatalogueRightsModel extends Model<
  CatalogueRightsModel,
  CatalogueRightsDetails
> {
  @PrimaryKey
  @Column({
    type: DataType.STRING(255),
    allowNull: false,
  })
  catalogue!: string;

  /** Flat boolean map keyed by CATALOGUE_RIGHT_KEYS. Always complete. */
  @Column({
    type: DataType.JSONB,
    allowNull: false,
    defaultValue: {},
  })
  rights!: object;

  /** users.id of the last internal editor. No FK — `users` is shared. */
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
}
