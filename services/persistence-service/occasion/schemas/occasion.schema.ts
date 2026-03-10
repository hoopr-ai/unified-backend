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

export interface OccasionDetails {
  id?: number;
  title: string;
  month: string;
  date: string;
  className: string;
  end: string;
  createdAt?: Date;
  updatedAt?: Date;
}

@Table({ tableName: "occasions", timestamps: true })
export class OccasionModel extends Model<OccasionModel, OccasionDetails> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.BIGINT)
  id!: number;

  @Column({ type: DataType.STRING(255), allowNull: false })
  title!: string;

  @Column({ type: DataType.STRING(20), allowNull: false })
  month!: string;

  @Column({ type: DataType.STRING(5), allowNull: false })
  date!: string;

  @Column({ type: DataType.STRING(100), allowNull: false })
  className!: string;

  @Column({ type: DataType.STRING(20), allowNull: false })
  end!: string;

  @CreatedAt
  @Column({ type: DataType.DATE })
  createdAt!: Date;

  @UpdatedAt
  @Column({ type: DataType.DATE, allowNull: true })
  updatedAt?: Date;
}
