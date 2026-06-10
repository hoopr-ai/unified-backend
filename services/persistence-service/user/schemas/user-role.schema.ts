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

export interface RoleRestrictionEntry {
  category?: string;
  ownerCode?: string;
}

// Per-user functionality allocation for INTERNAL CMS users. Stored in the
// `restrictions` JSONB column. A non-admin user only sees the CMS items whose
// id is in `functionalities`. ADMIN rows leave this null (access is by role).
export interface RoleRestrictions {
  functionalities?: string[];
}

export interface UserRoleDetails {
  id?: number;
  userId: number;
  role: UserRoles;
  status: string;
  restrictions?: RoleRestrictions | RoleRestrictionEntry[] | null;
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
  role!: UserRoles;

  @Column({
    type: DataType.STRING(100),
    allowNull: false,
  })
  status!: string;

  @Column({
    type: DataType.JSONB,
    allowNull: true,
  })
  restrictions?: RoleRestrictions | RoleRestrictionEntry[] | null;

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
