import {
  Table,
  Column,
  Model,
  DataType,
  PrimaryKey,
  HasMany,
} from "sequelize-typescript";
import { TrackKeywordMappingModel } from "./track-keyword-mapping.schema";

@Table({ tableName: "keywords", timestamps: false })
export class KeywordModel extends Model<KeywordModel> {
  @PrimaryKey
  @Column({ type: DataType.UUID })
  id!: string;

  @Column({ type: DataType.STRING(255), allowNull: true })
  keyword?: string;

  @Column({ type: DataType.STRING(255), allowNull: true })
  name_slug?: string;

  @Column({ type: DataType.BIGINT, allowNull: true })
  occasionId?: number;

  @HasMany(() => TrackKeywordMappingModel, {
    foreignKey: "keywordId",
    constraints: false,
  })
  trackKeywordMappings?: TrackKeywordMappingModel[];
}
