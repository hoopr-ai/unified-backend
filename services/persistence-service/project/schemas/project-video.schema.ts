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
  Default,
  Index,
} from "sequelize-typescript";
import { SoundProjectModel } from "./sound-project.schema";

export enum VideoFormat {
  MP4 = "MP4",
  MOV = "MOV",
  AVI = "AVI",
  WEBM = "WEBM",
}

export interface ProjectVideoDetails {
  id?: string;
  projectId: string;
  originalName: string;
  format: VideoFormat;
  gcsPath: string;
  bucketName: string;
  isActive?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

@Table({
  tableName: "project_videos",
  timestamps: true,
})
export class ProjectVideoModel extends Model<ProjectVideoModel, ProjectVideoDetails> {
  @PrimaryKey
  @Column({
    type: DataType.UUID,
    defaultValue: DataType.UUIDV4,
  })
  id!: string;

  @Index
  @ForeignKey(() => SoundProjectModel)
  @Column({
    type: DataType.UUID,
    allowNull: false,
  })
  projectId!: string;

  @Column({
    type: DataType.STRING(255),
    allowNull: false,
  })
  originalName!: string;

  @Column({
    type: DataType.STRING(10),
    allowNull: false,
  })
  format!: VideoFormat;

  @Column({
    type: DataType.TEXT,
    allowNull: false,
  })
  gcsPath!: string;

  @Column({
    type: DataType.STRING(255),
    allowNull: false,
  })
  bucketName!: string;

  @Default(true)
  @Column({
    type: DataType.BOOLEAN,
    allowNull: false,
  })
  isActive!: boolean;

  @CreatedAt
  @Column({ type: DataType.DATE })
  createdAt!: Date;

  @UpdatedAt
  @Column({ type: DataType.DATE })
  updatedAt!: Date;

  @BelongsTo(() => SoundProjectModel)
  project?: SoundProjectModel;
}
