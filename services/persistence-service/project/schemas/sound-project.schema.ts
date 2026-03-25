import {
  Table,
  Column,
  Model,
  DataType,
  PrimaryKey,
  CreatedAt,
  UpdatedAt,
  ForeignKey,
  BelongsTo,
  HasMany,
  HasOne,
  Default,
} from "sequelize-typescript";
import { UserModel } from "../../user/modules.export";
import { Platform } from "../../../dto-service/constants/common.enums";
import { ProjectVideoModel } from "./project-video.schema";
import { ProjectTrackModel } from "./project-track.schema";

export enum ProjectStatus {
  ACTIVE = "ACTIVE",
  ARCHIVED = "ARCHIVED",
}

export interface SoundProjectDetails {
  id?: string;
  userId: number;
  name: string;
  platform: Platform;
  status?: ProjectStatus;
  campaignIds?: string[];
  createdAt?: Date;
  updatedAt?: Date;
}

@Table({
  tableName: "sound_projects",
  timestamps: true,
})
export class SoundProjectModel extends Model<SoundProjectModel, SoundProjectDetails> {
  @PrimaryKey
  @Column({
    type: DataType.UUID,
    defaultValue: DataType.UUIDV4,
  })
  id!: string;

  @ForeignKey(() => UserModel)
  @Column({
    type: DataType.BIGINT,
    allowNull: false,
  })
  userId!: number;

  @Column({
    type: DataType.STRING(255),
    allowNull: false,
  })
  name!: string;

  @Column({
    type: DataType.STRING(100),
    allowNull: false,
  })
  platform!: Platform;

  @Default(ProjectStatus.ACTIVE)
  @Column({
    type: DataType.STRING(50),
    allowNull: false,
  })
  status!: ProjectStatus;

  @Column({
    type: DataType.JSON,
    allowNull: true,
  })
  campaignIds?: string[];

  @CreatedAt
  @Column({ type: DataType.DATE })
  createdAt!: Date;

  @UpdatedAt
  @Column({ type: DataType.DATE })
  updatedAt!: Date;

  @BelongsTo(() => UserModel)
  user?: UserModel;

  @HasMany(() => ProjectVideoModel, "projectId")
  videos?: ProjectVideoModel[];

  @HasOne(() => ProjectVideoModel, { foreignKey: "projectId", scope: { isActive: true }, as: "activeVideo" })
  activeVideo?: ProjectVideoModel;

  @HasMany(() => ProjectTrackModel, "projectId")
  tracks?: ProjectTrackModel[];
}
