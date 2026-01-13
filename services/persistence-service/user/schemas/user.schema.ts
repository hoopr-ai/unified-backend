import {
  Table,
  Column,
  Model,
  DataType,
  PrimaryKey,
  AutoIncrement,
  Unique,
  Default,
  CreatedAt,
  UpdatedAt,
} from "sequelize-typescript";

export interface UserDetails {
  id: number;
  email: string;
  password_hash: string;
  firstName?: string;
  lastName?: string;
  created_at: Date;
  updated_at: Date;
}

@Table({
  tableName: "users",
  timestamps: true,
})
export class UserModel extends Model<UserModel> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  id!: number;

  @Unique
  @Column({
    type: DataType.STRING(255),
    allowNull: false,
  })
  email!: string;

  @Column({
    type: DataType.STRING(255),
    allowNull: false,
  })
  password_hash!: string;

  @Column({
    type: DataType.STRING(255),
    allowNull: true,
  })
  firstName?: string;

  @Column({
    type: DataType.STRING(255),
    allowNull: true,
  })
  lastName?: string;

  @CreatedAt
  @Column({
    field: "created_at",
    type: DataType.DATE,
  })
  created_at!: Date;

  @UpdatedAt
  @Column({
    field: "updated_at",
    type: DataType.DATE,
  })
  updated_at!: Date;
}