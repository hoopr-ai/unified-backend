import {
  Table,
  Column,
  Model,
  DataType,
  PrimaryKey,
  AutoIncrement,
  CreatedAt,
  UpdatedAt,
  Index,
} from "sequelize-typescript";

export interface UserDetails {
  id: number;
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
  status: string;
  mobile?: string;
  platform: string;
  createdAt: Date;
  updatedAt?: Date;
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

  // Composite unique key: email + platform
  @Index({ name: "unique_email_platform", unique: true })
  @Column({
    type: DataType.STRING(255),
    allowNull: false,
  })
  email!: string;

  // Composite unique key: mobile + platform
  @Index({ name: "unique_mobile_platform", unique: true })
  @Column({
    type: DataType.STRING(100),
    allowNull: true,
  })
  mobile?: string;

  @Index({ name: "unique_email_platform", unique: true })
  @Index({ name: "unique_mobile_platform", unique: true })
  @Column({
    type: DataType.STRING(100),
    allowNull: false,
  })
  platform!: string;

  @Column({
    type: DataType.STRING(255),
    allowNull: false,
  })
  password!: string;

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
    allowNull: true,
  })
  updatedAt?: Date;
}