import {
  Table,
  Column,
  Model,
  DataType,
  PrimaryKey,
  BelongsTo,
  Index,
} from "sequelize-typescript";
import { KeywordModel } from "./keyword.schema";
import { TrackModel } from "../../track/schemas/track.schema";

@Table({ tableName: "track_keyword_mappings", timestamps: false })
export class TrackKeywordMappingModel extends Model<TrackKeywordMappingModel> {
  @PrimaryKey
  @Column({ type: DataType.UUID })
  id!: string;

  @Index({ name: "track_keyword_mappings_keywordId_trackId_key", unique: true })
  @Column({ type: DataType.UUID, allowNull: true })
  keywordId?: string;

  @Index({ name: "track_keyword_mappings_keywordId_trackId_key", unique: true })
  @Column({ type: DataType.UUID, allowNull: true })
  trackId?: string;

  @BelongsTo(() => KeywordModel, { foreignKey: "keywordId", constraints: false })
  keyword?: KeywordModel;

  @BelongsTo(() => TrackModel, { foreignKey: "trackId", constraints: false })
  track?: TrackModel;
}
