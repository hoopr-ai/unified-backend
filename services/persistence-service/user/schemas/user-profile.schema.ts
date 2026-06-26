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
  Index,
} from "sequelize-typescript";
import { UserModel } from "./user.schema";

export interface UserProfileAttributes {
  id?: number;
  userId: number;
  instagramLink?: string | null;
  youtubeLink?: string | null;
  facebookLink?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}

@Table({
  tableName: "user_profiles",
  timestamps: true,
})
export class UserProfileModel extends Model<UserProfileModel, UserProfileAttributes> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.BIGINT)
  id!: number;

  @ForeignKey(() => UserModel)
  @Index({ name: "unique_user_profile_user", unique: true })
  @Column({ type: DataType.INTEGER, allowNull: false })
  userId!: number;

  @Column({ type: DataType.STRING(500), allowNull: true })
  instagramLink?: string | null;

  @Column({ type: DataType.STRING(500), allowNull: true })
  youtubeLink?: string | null;

  @Column({ type: DataType.STRING(500), allowNull: true })
  facebookLink?: string | null;

  @CreatedAt
  @Column({ type: DataType.DATE })
  createdAt!: Date;

  @UpdatedAt
  @Column({ type: DataType.DATE })
  updatedAt!: Date;

  @BelongsTo(() => UserModel)
  user!: UserModel;
}
