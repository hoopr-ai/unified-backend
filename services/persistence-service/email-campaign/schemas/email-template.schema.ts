import {
  Table,
  Column,
  Model,
  DataType,
  PrimaryKey,
  Default,
  CreatedAt,
  UpdatedAt,
  DeletedAt,
} from "sequelize-typescript";

export interface EmailTemplateDetails {
  id?: string;
  name: string;
  subject?: string | null;
  html: string;
  description?: string | null;
  createdBy?: number | null;
  createdAt?: Date;
  updatedAt?: Date;
  deletedAt?: Date | null;
}

@Table({ tableName: "email_templates", timestamps: true, paranoid: true })
export class EmailTemplateModel extends Model<EmailTemplateModel, EmailTemplateDetails> {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  id!: string;

  @Column({ type: DataType.STRING, allowNull: false })
  name!: string;

  @Column({ type: DataType.STRING, allowNull: true })
  subject?: string | null;

  @Column({ type: DataType.TEXT, allowNull: false })
  html!: string;

  @Column({ type: DataType.TEXT, allowNull: true })
  description?: string | null;

  @Column({ type: DataType.BIGINT, allowNull: true })
  createdBy?: number | null;

  @CreatedAt
  @Column({ type: DataType.DATE, allowNull: false })
  createdAt!: Date;

  @UpdatedAt
  @Column({ type: DataType.DATE, allowNull: true })
  updatedAt?: Date;

  @DeletedAt
  @Column({ type: DataType.DATE, allowNull: true })
  deletedAt?: Date | null;
}
