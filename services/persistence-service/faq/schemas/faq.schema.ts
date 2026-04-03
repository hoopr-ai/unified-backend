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
import type { FaqSection } from "../../../dto-service/faq/faq.enum";
import type { Platform } from "../../../dto-service/constants/common.enums";

export interface FaqDetails {
  id?: number;
  platform: Platform;
  section: FaqSection;
  question: string;
  answer: string;
  order: number;
  isActive: boolean;
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

  @Column({
    type: DataType.STRING(100),
    allowNull: false,
  })
  platform!: Platform;

  @Column({
    type: DataType.STRING(100),
    allowNull: false,
  })
  section!: FaqSection;

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

  @CreatedAt
  @Column({
    type: DataType.DATE,
  })
  createdAt!: Date;

  @UpdatedAt
  @Column({
    type: DataType.DATE,
    allowNull: true,
  })
  updatedAt?: Date;
}
