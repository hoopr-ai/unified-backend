import {
  Table,
  Column,
  Model,
  DataType,
  PrimaryKey,
  AutoIncrement,
  CreatedAt,
  UpdatedAt,
} from "sequelize-typescript";

export interface BriefAttributes {
  id?: number;
  title: string;
  subtitle?: string | null;
  description?: string | null;
  image?: string | null;
  startDate?: Date | null;
  endDate?: Date | null;
  resultDate?: Date | null;
  category?: string | null;
  prize?: string | null;
  benefits?: string | null;
  genre?: string | null;
  language?: string | null;
  rules?: string | null;
  directorNotes?: string | null;
  backingTrackAudioName?: string | null;
  backingTrackYoutubeLink?: string | null;
  isActive?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

@Table({
  tableName: "briefs",
  timestamps: true,
})
export class BriefModel extends Model<BriefModel, BriefAttributes> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.BIGINT)
  id!: number;

  @Column({ type: DataType.STRING(255), allowNull: false })
  title!: string;

  @Column({ type: DataType.STRING(255), allowNull: true })
  subtitle?: string | null;

  @Column({ type: DataType.TEXT, allowNull: true })
  description?: string | null;

  @Column({ type: DataType.TEXT, allowNull: true })
  image?: string | null;

  @Column({ type: DataType.DATE, allowNull: true })
  startDate?: Date | null;

  @Column({ type: DataType.DATE, allowNull: true })
  endDate?: Date | null;

  @Column({ type: DataType.DATE, allowNull: true })
  resultDate?: Date | null;

  @Column({ type: DataType.STRING(100), allowNull: true })
  category?: string | null;

  @Column({ type: DataType.STRING(255), allowNull: true })
  prize?: string | null;

  @Column({ type: DataType.TEXT, allowNull: true })
  benefits?: string | null;

  @Column({ type: DataType.STRING(255), allowNull: true })
  genre?: string | null;

  @Column({ type: DataType.STRING(255), allowNull: true })
  language?: string | null;

  @Column({ type: DataType.TEXT, allowNull: true })
  rules?: string | null;

  @Column({ type: DataType.TEXT, allowNull: true })
  directorNotes?: string | null;

  @Column({ type: DataType.STRING(255), allowNull: true })
  backingTrackAudioName?: string | null;

  @Column({ type: DataType.TEXT, allowNull: true })
  backingTrackYoutubeLink?: string | null;

  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: true })
  isActive!: boolean;

  @CreatedAt
  @Column({ type: DataType.DATE })
  createdAt!: Date;

  @UpdatedAt
  @Column({ type: DataType.DATE })
  updatedAt!: Date;
}
