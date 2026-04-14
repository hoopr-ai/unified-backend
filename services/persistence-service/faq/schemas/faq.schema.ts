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
} from "sequelize-typescript";
import { FaqSectionModel } from "./faq-section.schema";

export interface FaqDetails {
  id?: number;
  sectionId: number;
  question: string;
  answer: string;
  order: number;
  isActive: boolean;
  updatedBy?: number;
  createdAt: Date;
  updatedAt?: Date;
}

@Table({
  tableName: "faqs",
  timestamps: true,
})
export class FaqModel extends Model<FaqModel, FaqDetails> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.BIGINT)
  id!: number;

  @ForeignKey(() => FaqSectionModel)
  @Column({
    type: DataType.BIGINT,
    allowNull: false,
  })
  sectionId!: number;

  @Column({
    type: DataType.TEXT,
    allowNull: false,
  })
  question!: string;

  @Column({
    type: DataType.TEXT,
    allowNull: false,
  })
  answer!: string;

  @Column({
    type: DataType.INTEGER,
    allowNull: false,
    defaultValue: 0,
  })
  order!: number;

  @Column({
    type: DataType.BOOLEAN,
    allowNull: false,
    defaultValue: true,
  })
  isActive!: boolean;

  @Column({
    type: DataType.BIGINT,
    allowNull: true,
  })
  updatedBy?: number;

  @CreatedAt
  @Column({
    type: DataType.DATE,
    allowNull: false,
  })
  createdAt!: Date;

  @UpdatedAt
  @Column({
    type: DataType.DATE,
    allowNull: true,
  })
  updatedAt?: Date;

  @BelongsTo(() => FaqSectionModel)
  section?: FaqSectionModel;
}
