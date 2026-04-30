import {
  Table, Column, Model, DataType, PrimaryKey, AutoIncrement,
  CreatedAt, UpdatedAt, ForeignKey, BelongsTo, Index,
} from "sequelize-typescript";
import { UserModel } from "../src/models/user.schema";

export interface ArtistProfileAttributes {
  id?: number;
  userId: number;
  stageName?: string | null;
  fullName?: string | null;
  isIprsMember?: boolean;
  isExclusivelySigned?: boolean;
  instagramLink?: string | null;
  spotifyLink?: string | null;
  briefPermission?: boolean | null;
  profileCompleted?: boolean;
  languages?: string[] | null;
  roles?: string[] | null;
  city?: string | null;
  state?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}

@Table({ tableName: "artist_profiles", timestamps: true })
export class ArtistProfileModel extends Model<ArtistProfileModel, ArtistProfileAttributes> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.BIGINT)
  id!: number;

  @ForeignKey(() => UserModel)
  @Index({ name: "unique_artist_profile_user", unique: true })
  @Column({ type: DataType.INTEGER, allowNull: false })
  userId!: number;

  @Column({ type: DataType.STRING(255), allowNull: true })
  stageName?: string | null;

  @Column({ type: DataType.STRING(255), allowNull: true })
  fullName?: string | null;

  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: false })
  isIprsMember!: boolean;

  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: false })
  isExclusivelySigned!: boolean;

  @Column({ type: DataType.STRING(500), allowNull: true })
  instagramLink?: string | null;

  @Column({ type: DataType.STRING(500), allowNull: true })
  spotifyLink?: string | null;

  @Column({ type: DataType.BOOLEAN, allowNull: true })
  briefPermission?: boolean | null;

  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: false })
  profileCompleted!: boolean;

  @Column({ type: DataType.ARRAY(DataType.STRING(100)), allowNull: true })
  languages?: string[] | null;

  @Column({ type: DataType.ARRAY(DataType.STRING(100)), allowNull: true })
  roles?: string[] | null;

  @Column({ type: DataType.STRING(100), allowNull: true })
  city?: string | null;

  @Column({ type: DataType.STRING(100), allowNull: true })
  state?: string | null;

  @CreatedAt
  @Column({ type: DataType.DATE })
  createdAt!: Date;

  @UpdatedAt
  @Column({ type: DataType.DATE })
  updatedAt!: Date;

  @BelongsTo(() => UserModel)
  user!: UserModel;
}
