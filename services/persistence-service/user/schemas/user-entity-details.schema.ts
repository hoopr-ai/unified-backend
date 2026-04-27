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
import { UserModel } from "./modules.export";

export interface UserEntityDetailsAttributes {
  id?: number;
  userId: number;
  labelName?: string | null;
  entityType?: string | null;
  email?: string | null;
  phoneNumber?: string | null;
  countryCode?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}

@Table({
  tableName: "user_entity_details",
  timestamps: true,
})
export class UserEntityDetailsModel extends Model<
  UserEntityDetailsModel,
  UserEntityDetailsAttributes
> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.BIGINT)
  id!: number;

  @ForeignKey(() => UserModel)
  @Index({ name: "idx_user_entity_details_user_id", unique: true })
  @Column({ type: DataType.INTEGER, allowNull: false })
  userId!: number;

  @Column({ type: DataType.STRING(255), allowNull: true })
  labelName?: string | null;

  @Column({ type: DataType.STRING(100), allowNull: true })
  entityType?: string | null;

  @Column({ type: DataType.STRING(255), allowNull: true })
  email?: string | null;

  @Column({ type: DataType.STRING(50), allowNull: true })
  phoneNumber?: string | null;

  @Column({ type: DataType.STRING(10), allowNull: true })
  countryCode?: string | null;

  @CreatedAt
  @Column({ type: DataType.DATE })
  createdAt!: Date;

  @UpdatedAt
  @Column({ type: DataType.DATE })
  updatedAt!: Date;

  @BelongsTo(() => UserModel)
  user!: UserModel;
}
