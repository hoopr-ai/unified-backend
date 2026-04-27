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

export interface BankDetailsAttributes {
  id?: number;
  userId: number;
  accountHolderName: string;
  bankName: string;
  accountNumber: string;
  branchName?: string | null;
  ifscCode: string;
  createdAt?: Date;
  updatedAt?: Date;
}

@Table({
  tableName: "bank_details",
  timestamps: true,
})
export class BankDetailsModel extends Model<BankDetailsModel, BankDetailsAttributes> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.BIGINT)
  id!: number;

  @ForeignKey(() => UserModel)
  @Index({ name: "idx_bank_details_user_id", unique: true })
  @Column({ type: DataType.INTEGER, allowNull: false })
  userId!: number;

  @Column({ type: DataType.STRING(255), allowNull: false })
  accountHolderName!: string;

  @Column({ type: DataType.STRING(255), allowNull: false })
  bankName!: string;

  @Column({ type: DataType.TEXT, allowNull: false })
  accountNumber!: string;

  @Column({ type: DataType.STRING(255), allowNull: true })
  branchName?: string | null;

  @Column({ type: DataType.TEXT, allowNull: false })
  ifscCode!: string;

  @CreatedAt
  @Column({ type: DataType.DATE })
  createdAt!: Date;

  @UpdatedAt
  @Column({ type: DataType.DATE })
  updatedAt!: Date;

  @BelongsTo(() => UserModel)
  user!: UserModel;
}
