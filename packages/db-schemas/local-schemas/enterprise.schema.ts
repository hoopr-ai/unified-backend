import {
  Table,
  Column,
  Model,
  DataType,
  PrimaryKey,
  Default,
  Index,
  CreatedAt,
  UpdatedAt,
  HasMany,
} from "sequelize-typescript";
import { EnterpriseStatus } from "../src/enums/index";
import { EnterprisePlaylistMappingModel } from "../src/models/enterprise-playlist-mapping.schema";

/**
 * A B2B API consumer ("enterprise" / client).
 *
 * Auth model (OAuth2 client-credentials):
 *  - `id` is the public `client_id`.
 *  - `clientSecretHash` is a bcrypt hash of the client secret. The plaintext
 *    secret is shown ONCE at creation/rotation and never stored.
 *  - A client exchanges (client_id, client_secret) at the token endpoint for a
 *    short-lived JWT access token used as a Bearer on every other request.
 */
export interface EnterpriseDetails {
  id: string;
  name: string;
  clientSecretHash: string;
  status: EnterpriseStatus;
  scopes: string[];
  unrestrictedCatalog: boolean;
  contactEmail?: string | null;
  secretRotatedAt?: Date | null;
  lastUsedAt?: Date | null;
  createdAt: Date;
  updatedAt?: Date;
}

@Table({
  tableName: "enterprises",
  timestamps: true,
})
export class EnterpriseModel extends Model<EnterpriseModel, EnterpriseDetails> {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column({ type: DataType.UUID })
  id!: string;

  @Index({ name: "enterprises_name_key", unique: true })
  @Column({ type: DataType.STRING(255), allowNull: false })
  name!: string;

  @Column({ type: DataType.STRING(255), allowNull: false })
  clientSecretHash!: string;

  @Default(EnterpriseStatus.ACTIVE)
  @Column({ type: DataType.STRING(50), allowNull: false })
  status!: EnterpriseStatus;

  @Default([])
  @Column({ type: DataType.ARRAY(DataType.STRING), allowNull: false })
  scopes!: string[];

  @Default(false)
  @Column({ type: DataType.BOOLEAN, allowNull: false })
  unrestrictedCatalog!: boolean;

  @Column({ type: DataType.STRING(255), allowNull: true })
  contactEmail?: string | null;

  @Column({ type: DataType.DATE, allowNull: true })
  secretRotatedAt?: Date | null;

  @Column({ type: DataType.DATE, allowNull: true })
  lastUsedAt?: Date | null;

  @CreatedAt
  @Column({ type: DataType.DATE })
  createdAt!: Date;

  @UpdatedAt
  @Column({ type: DataType.DATE, allowNull: true })
  updatedAt?: Date;

  @HasMany(() => EnterprisePlaylistMappingModel, {
    foreignKey: "enterpriseId",
    constraints: false,
  })
  playlistMappings?: EnterprisePlaylistMappingModel[];
}
