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
import type { UserRoles } from "../../../dto-service/modules.export";

export interface UserRoleDetails {
  id?: number;
  userId: number;
  role: UserRoles;
  status: string;
  createdAt: Date;
  updatedAt?: Date;
}

@Table({
  tableName: "user_roles",
  timestamps: true,
})
export class UserRoleModel extends Model<UserRoleModel, UserRoleDetails> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.BIGINT)
  id!: number;

  @ForeignKey(() => UserModel)
  @Column({
    type: DataType.BIGINT,
    allowNull: false,
  })
  userId!: number;

  @Column({
    type: DataType.STRING(100),
    allowNull: false,
  })
  role!: UserRoles;

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
