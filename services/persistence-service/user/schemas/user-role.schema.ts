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
import { UserModel } from "./modules.export";

export interface UserRoleDetails {
  id: number;
  userId: number;
  role: string;
  status: string;
  createdAt: Date;
  updatedAt?: Date;
}

@Table({
  tableName: "user_roles",
  timestamps: true,
})
export class UserRoleModel extends Model<UserRoleModel> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  id!: number;

  @ForeignKey(() => UserModel)
  @Column({
    type: DataType.INTEGER,
    allowNull: false,
  })
  userId!: number;

  @Column({
    type: DataType.STRING(100),
    allowNull: false,
  })
  role!: string;

  @Column({
    type: DataType.STRING(100),
    allowNull: false,
  })
  status!: string;

  @CreatedAt
  @Column({
    type: DataType.DATE,
  })
  createdAt!: Date;

  @UpdatedAt
  @Column({
    type: DataType.DATE,
  })
  updatedAt?: Date;

  @BelongsTo(() => UserModel)
  user!: UserModel;
}
