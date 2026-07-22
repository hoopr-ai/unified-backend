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

// Self-service access requests for the INTERNAL CMS.
//
// A non-admin internal user picks a set of functionality ids (the same ids used
// by internal-fe's home cards + FunctionalityRoute) and one or more admins to
// ask. An admin (or any holder of the `internal-users` functionality) approves,
// which MERGES the requested ids into the requester's grant list on user_roles.
//
// There is deliberately NO catalog restriction on which functionality ids may
// be requested — every functionality is shareable, including admin ones. See
// the repo docs/ACCESS-MODEL.md. Do not reintroduce a whitelist here.

export type AccessRequestStatus =
  | "PENDING"
  | "APPROVED"
  | "REJECTED"
  | "CANCELLED";

export interface AccessRequestDetails {
  id?: number;
  requesterUserId: number;
  // Requested functionality ids (arbitrary strings — FE owns the catalog).
  functionalities: string[];
  // Ids of the admins the requester chose to ask. Any admin can still act.
  adminIds: number[];
  note?: string | null;
  status: AccessRequestStatus;
  // The admin (or internal-users holder) who approved/rejected, and when.
  reviewedByUserId?: number | null;
  reviewedAt?: Date | null;
  reviewNote?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}

@Table({
  tableName: "access_requests",
  timestamps: true,
})
export class AccessRequestModel extends Model<
  AccessRequestModel,
  AccessRequestDetails
> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  id!: number;

  @ForeignKey(() => UserModel)
  @Column({
    type: DataType.INTEGER,
    allowNull: false,
  })
  requesterUserId!: number;

  @Column({
    type: DataType.JSONB,
    allowNull: false,
    defaultValue: [],
  })
  functionalities!: string[];

  @Column({
    type: DataType.JSONB,
    allowNull: false,
    defaultValue: [],
  })
  adminIds!: number[];

  @Column({
    type: DataType.TEXT,
    allowNull: true,
  })
  note?: string | null;

  @Column({
    type: DataType.STRING(20),
    allowNull: false,
    defaultValue: "PENDING",
  })
  status!: AccessRequestStatus;

  @Column({
    type: DataType.INTEGER,
    allowNull: true,
  })
  reviewedByUserId?: number | null;

  @Column({
    type: DataType.DATE,
    allowNull: true,
  })
  reviewedAt?: Date | null;

  @Column({
    type: DataType.TEXT,
    allowNull: true,
  })
  reviewNote?: string | null;

  @CreatedAt
  @Column({ type: DataType.DATE })
  createdAt!: Date;

  @UpdatedAt
  @Column({ type: DataType.DATE })
  updatedAt?: Date;

  @BelongsTo(() => UserModel)
  requester!: UserModel;
}
