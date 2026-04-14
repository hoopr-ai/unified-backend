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
  videoDuration?: number;
  previewFrame?: string;
  previewClip?: string;
  originalVideoUrl?: string;
  committedTrackCode?: string;
  workingTrackCode?: string;
  committedEdits?: object;
  workingEdits?: object;
  lastOpenedAt?: Date;
  recommendations?: object[];
  preprocessedFrames?: number;
  campaignId?: number;
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
    type: DataType.DOUBLE,
    allowNull: true,
  })
  videoDuration?: number;

  @Column({
    type: DataType.TEXT,
    allowNull: true,
  })
  previewFrame?: string;

  @Column({
    type: DataType.TEXT,
    allowNull: true,
  })
  previewClip?: string;

  @Column({
    type: DataType.TEXT,
    allowNull: true,
  })
  originalVideoUrl?: string;

  @Column({
    type: DataType.TEXT,
    allowNull: true,
  })
  committedTrackCode?: string;

  @Column({
    type: DataType.TEXT,
    allowNull: true,
  })
  workingTrackCode?: string;

  @Default({})
  @Column({
    type: DataType.JSONB,
    allowNull: true,
  })
  committedEdits?: object;

  @Default({})
  @Column({
    type: DataType.JSONB,
    allowNull: true,
  })
  workingEdits?: object;

  @Column({
    type: DataType.DATE,
    allowNull: true,
  })
  lastOpenedAt?: Date;

  @Default([])
  @Column({
    type: DataType.JSONB,
    allowNull: true,
  })
  recommendations?: object[];

  @Default(0)
  @Column({
    type: DataType.INTEGER,
    allowNull: true,
  })
  preprocessedFrames?: number;

  @Column({
    type: DataType.BIGINT,
    allowNull: true,
  })
  campaignId?: number;

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
