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
import type { Platform } from "../../../dto-service/constants/common.enums";

export interface FaqSectionDetails {
  id?: number;
  platform: Platform;
  name: string;
  slug: string;
  order: number;
  isActive: boolean;
  updatedBy?: number;
  createdAt: Date;
  updatedAt?: Date;
}

@Table({
  tableName: "faq_sections",
  timestamps: true,
})
export class FaqSectionModel extends Model<FaqSectionModel, FaqSectionDetails> {
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
    type: DataType.STRING(255),
    allowNull: false,
  })
  name!: string;

  @Column({
    type: DataType.STRING(255),
    allowNull: false,
  })
  slug!: string;

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
  })
  createdAt!: Date;

  @UpdatedAt
  @Column({
    type: DataType.DATE,
    allowNull: true,
  })
  updatedAt?: Date;
}
