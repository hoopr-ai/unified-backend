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
import { UserModel } from "./modules.export";
import type { ArtistUploadStatus } from "../../../dto-service/modules.export";

export interface ArtistUploadAttributes {
  id?: number;
  userId: number;
  title: string;
  description?: string | null;
  filePath: string;
  fileSize: number;
  durationSeconds?: number | null;
  highlightStartSeconds?: number | null;
  highlightEndSeconds?: number | null;
  briefId?: number | null;
  briefTitle?: string | null;
  permissionFormId?: number | null;
  permissionConfirmed?: boolean;
  uploadStatus?: ArtistUploadStatus;
  tempFilePath?: string | null;
  isActive?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

@Table({
  tableName: "artist_uploads",
  timestamps: true,
})
export class ArtistUploadModel extends Model<
  ArtistUploadModel,
  ArtistUploadAttributes
> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.BIGINT)
  id!: number;

  @ForeignKey(() => UserModel)
  @Index({ name: "idx_artist_uploads_user_id" })
  @Column({ type: DataType.INTEGER, allowNull: false })
  userId!: number;

  @Column({ type: DataType.STRING(200), allowNull: false })
  title!: string;

  @Column({ type: DataType.TEXT, allowNull: true })
  description?: string | null;

  @Column({ type: DataType.TEXT, allowNull: false })
  filePath!: string;

  @Column({ type: DataType.BIGINT, allowNull: false })
  fileSize!: number;

  @Column({ type: DataType.DECIMAL, allowNull: true })
  durationSeconds?: number | null;

  @Column({ type: DataType.DECIMAL, allowNull: true })
  highlightStartSeconds?: number | null;

  @Column({ type: DataType.DECIMAL, allowNull: true })
  highlightEndSeconds?: number | null;

  @Index({ name: "idx_artist_uploads_brief_id" })
  @Column({ type: DataType.BIGINT, allowNull: true })
  briefId?: number | null;

  @Column({ type: DataType.STRING(255), allowNull: true })
  briefTitle?: string | null;

  @Column({ type: DataType.BIGINT, allowNull: true, defaultValue: 2 })
  permissionFormId?: number | null;

  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: false })
  permissionConfirmed!: boolean;

  @Index({ name: "idx_artist_uploads_status" })
  @Column({
    type: DataType.STRING(50),
    allowNull: false,
    defaultValue: "PENDING",
  })
  uploadStatus!: ArtistUploadStatus;

  @Column({ type: DataType.TEXT, allowNull: true })
  tempFilePath?: string | null;

  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: true })
  isActive!: boolean;

  @CreatedAt
  @Column({ type: DataType.DATE })
  createdAt!: Date;

  @UpdatedAt
  @Column({ type: DataType.DATE })
  updatedAt!: Date;

  @BelongsTo(() => UserModel)
  user!: UserModel;
}
