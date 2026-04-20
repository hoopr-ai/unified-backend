import {
  Table,
  Column,
  Model,
  DataType,
  PrimaryKey,
  CreatedAt,
  ForeignKey,
  BelongsTo,
  AutoIncrement,
} from "sequelize-typescript";
import { SoundProjectModel } from "./sound-project.schema";
import { TrackModel } from "../../track/modules.export";

export interface ProjectTrackDetails {
  id?: number;
  projectId: string;
  trackCode: string;
  score?: number;
  fromTime?: number;
  tillTime?: number;
  volume?: number;
  finalVideoPath?: string;
  createdAt?: Date;
}

@Table({
  tableName: "project_tracks",
  timestamps: false,
})
export class ProjectTrackModel extends Model<ProjectTrackModel, ProjectTrackDetails> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.BIGINT)
  id!: number;

  @ForeignKey(() => SoundProjectModel)
  @Column({
    type: DataType.UUID,
    allowNull: false,
  })
  projectId!: string;

  @ForeignKey(() => TrackModel)
  @Column({
    type: DataType.STRING(255),
    allowNull: false,
  })
  trackCode!: string;

  @Column({
    type: DataType.FLOAT,
    allowNull: true,
  })
  score?: number;

  @Column({
    type: DataType.INTEGER,
    allowNull: true,
  })
  fromTime?: number;

  @Column({
    type: DataType.INTEGER,
    allowNull: true,
  })
  tillTime?: number;

  @Column({
    type: DataType.INTEGER,
    allowNull: true,
  })
  volume?: number;

  @Column({
    type: DataType.TEXT,
    allowNull: true,
  })
  finalVideoPath?: string;

  @CreatedAt
  @Column({ type: DataType.DATE })
  createdAt!: Date;

  @BelongsTo(() => SoundProjectModel)
  project?: SoundProjectModel;

  @BelongsTo(() => TrackModel, { foreignKey: "trackCode", targetKey: "trackCode" })
  track?: TrackModel;
}
