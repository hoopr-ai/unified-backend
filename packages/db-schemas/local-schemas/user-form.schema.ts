import {
  Table, Column, Model, DataType, PrimaryKey, AutoIncrement,
  CreatedAt, UpdatedAt, ForeignKey, BelongsTo, Index,
} from "sequelize-typescript";
import { UserModel } from "../src/models/user.schema";

export interface UserFormAttributes {
  id?: number;
  name: string;
  description?: string | null;
  active?: boolean;
  allowRepeat?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface UserFormQuestionAttributes {
  id?: number;
  formId: number;
  questionText: string;
  questionSubtext?: string | null;
  displayOrder?: number;
  active?: boolean;
  mandatory?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

@Table({ tableName: "user_forms", timestamps: true })
export class UserFormModel extends Model<UserFormModel, UserFormAttributes> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.BIGINT)
  id!: number;

  @Column({ type: DataType.STRING(255), allowNull: false })
  name!: string;

  @Column({ type: DataType.TEXT, allowNull: true })
  description?: string | null;

  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: true })
  active!: boolean;

  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: false })
  allowRepeat!: boolean;

  @CreatedAt
  @Column({ type: DataType.DATE })
  createdAt!: Date;

  @UpdatedAt
  @Column({ type: DataType.DATE })
  updatedAt!: Date;
}

@Table({ tableName: "user_form_questions", timestamps: true })
export class UserFormQuestionModel extends Model<UserFormQuestionModel, UserFormQuestionAttributes> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.BIGINT)
  id!: number;

  @ForeignKey(() => UserFormModel)
  @Index({ name: "idx_user_form_questions_form_id" })
  @Column({ type: DataType.BIGINT, allowNull: false })
  formId!: number;

  @Column({ type: DataType.TEXT, allowNull: false })
  questionText!: string;

  @Column({ type: DataType.TEXT, allowNull: true })
  questionSubtext?: string | null;

  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 0 })
  displayOrder!: number;

  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: true })
  active!: boolean;

  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: false })
  mandatory!: boolean;

  @CreatedAt
  @Column({ type: DataType.DATE })
  createdAt!: Date;

  @UpdatedAt
  @Column({ type: DataType.DATE })
  updatedAt!: Date;

  @BelongsTo(() => UserFormModel)
  form!: UserFormModel;
}

@Table({ tableName: "user_form_answers", timestamps: true })
export class UserFormAnswerModel extends Model {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.BIGINT)
  id!: number;

  @ForeignKey(() => UserFormModel)
  @Index({ name: "idx_user_form_answers_form_id" })
  @Column({ type: DataType.BIGINT, allowNull: false })
  formId!: number;

  @ForeignKey(() => UserFormQuestionModel)
  @Index({ name: "unique_user_question", unique: true })
  @Column({ type: DataType.BIGINT, allowNull: false })
  questionId!: number;

  @ForeignKey(() => UserModel)
  @Index({ name: "unique_user_question", unique: true })
  @Column({ type: DataType.INTEGER, allowNull: false })
  userId!: number;

  @Column({ type: DataType.TEXT, allowNull: true })
  answer?: string | null;

  @Column({ type: DataType.DATE, allowNull: true })
  answeredAt?: Date | null;

  @CreatedAt
  @Column({ type: DataType.DATE })
  createdAt!: Date;

  @UpdatedAt
  @Column({ type: DataType.DATE })
  updatedAt!: Date;

  @BelongsTo(() => UserFormModel)
  form!: UserFormModel;

  @BelongsTo(() => UserFormQuestionModel)
  question!: UserFormQuestionModel;

  @BelongsTo(() => UserModel)
  user!: UserModel;
}
